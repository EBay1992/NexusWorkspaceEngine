using System.Security.Claims;
using Microsoft.Extensions.Options;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Data;
using Orbit.Gateway.Models;
using Orbit.Gateway.Services;

namespace Orbit.Gateway.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (
            LoginRequest request,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            var result = await authService.LoginAsync(request, cancellationToken);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(result);
        });

        app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
        {
            var userId = GetUserId(user);
            var email = user.FindFirstValue(ClaimTypes.Email)
                ?? user.FindFirstValue("email");
            if (userId is null || string.IsNullOrWhiteSpace(email))
            {
                return Results.Unauthorized();
            }

            return Results.Ok(new { userId = userId.Value, email });
        }).RequireAuthorization();

        return app;
    }

    public static Guid? GetUserIdFromPrincipal(ClaimsPrincipal user) => GetUserId(user);

    private static Guid? GetUserId(ClaimsPrincipal user)
    {
        var sub = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub");
        return Guid.TryParse(sub, out var userId) ? userId : null;
    }
}

public static class RoleParse
{
    public static bool TryParse(string? role, out WorkspaceRole parsed)
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(role)) return false;
        try
        {
            parsed = WorkspaceRoles.Parse(role.Trim().ToLowerInvariant());
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }

    public static string Name(WorkspaceRole role) => role switch
    {
        WorkspaceRole.Owner => WorkspaceRoles.Owner,
        WorkspaceRole.Editor => WorkspaceRoles.Editor,
        WorkspaceRole.Viewer => WorkspaceRoles.Viewer,
        _ => throw new ArgumentOutOfRangeException(nameof(role)),
    };
}

public sealed record CreateMemberRequest(string Email, string Password, string Role);

public sealed record CreateShareLinkRequest(string Role);

public static class WorkspaceEndpoints
{
    public static IEndpointRouteBuilder MapWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workspaces").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal user,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();

            var workspaces = await repository.ListWorkspacesForUserAsync(userId.Value, cancellationToken);
            return Results.Ok(workspaces);
        });

        group.MapGet("/{workspaceId}", async (
            string workspaceId,
            ClaimsPrincipal user,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();

            var workspace = await repository.FindWorkspaceForUserAsync(workspaceId, userId.Value, cancellationToken);
            return workspace is null ? Results.Forbid() : Results.Ok(workspace);
        });

        group.MapPost("/{workspaceId}/ws-ticket", async (
            string workspaceId,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWsTicketService ticketService,
            CancellationToken cancellationToken) =>
            await IssueWsTicket(workspaceId, "default", user, authorization, ticketService, cancellationToken));

        group.MapPost("/{workspaceId}/snapshots", async (
            string workspaceId,
            HttpRequest httpRequest,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            ISnapshotIngestionService ingestion,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();

            if (!await authorization.CanWriteAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            if (!httpRequest.Headers.ContentEncoding.Contains("gzip", StringComparer.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { error = "Content-Encoding: gzip required" });
            }

            using var ms = new MemoryStream();
            await httpRequest.Body.CopyToAsync(ms, cancellationToken);
            if (ms.Length == 0) return Results.BadRequest(new { error = "empty body" });

            await ingestion.EnqueueAsync(
                new SnapshotRequest(workspaceId, "default", userId.Value, ms.ToArray()),
                cancellationToken);

            return Results.Accepted(value: new { accepted = true });
        });

        group.MapGet("/{workspaceId}/members", async (
            string workspaceId,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();
            if (!await authorization.CanAdminAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            var members = await repository.ListMembersAsync(workspaceId, cancellationToken);
            return Results.Ok(members);
        });

        group.MapPost("/{workspaceId}/members", async (
            string workspaceId,
            CreateMemberRequest body,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();
            if (!await authorization.CanAdminAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            if (string.IsNullOrWhiteSpace(body.Email) || string.IsNullOrWhiteSpace(body.Password))
            {
                return Results.BadRequest(new { error = "email and password are required" });
            }

            if (!RoleParse.TryParse(body.Role, out var role) || role == WorkspaceRole.Owner)
            {
                return Results.BadRequest(new { error = "role must be editor or viewer" });
            }

            if (!await repository.WorkspaceExistsAsync(workspaceId, cancellationToken))
            {
                return Results.NotFound(new { error = "workspace not found" });
            }

            var email = body.Email.Trim().ToLowerInvariant();
            var existing = await repository.FindUserByEmailAsync(email, cancellationToken);
            var memberUser = existing ?? await repository.CreateUserAsync(email, body.Password, cancellationToken);

            await repository.UpsertMembershipAsync(workspaceId, memberUser.Id, role, cancellationToken);
            return Results.Ok(new { userId = memberUser.Id, email = memberUser.Email, role = RoleParse.Name(role) });
        });

        group.MapGet("/{workspaceId}/share-links", async (
            string workspaceId,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();
            if (!await authorization.CanAdminAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            var links = await repository.ListActiveShareLinksAsync(workspaceId, cancellationToken);
            return Results.Ok(links.Select(l => new { id = l.Id, role = l.Role, createdAt = l.CreatedAt }));
        });

        group.MapPost("/{workspaceId}/share-links", async (
            string workspaceId,
            CreateShareLinkRequest body,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWorkspaceRepository repository,
            IOptions<GatewayOptions> gatewayOptions,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();
            if (!await authorization.CanAdminAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            if (!RoleParse.TryParse(body.Role, out var role) || role == WorkspaceRole.Owner)
            {
                return Results.BadRequest(new { error = "role must be editor or viewer" });
            }

            if (!await repository.WorkspaceExistsAsync(workspaceId, cancellationToken))
            {
                return Results.NotFound(new { error = "workspace not found" });
            }

            var (id, rawToken) = await repository.CreateOrRotateShareLinkAsync(
                workspaceId,
                role,
                userId.Value,
                cancellationToken);

            var path = $"/join/{Uri.EscapeDataString(workspaceId)}/{RoleParse.Name(role)}/{Uri.EscapeDataString(rawToken)}";
            var appOrigin = gatewayOptions.Value.WebOrigin.TrimEnd('/');
            return Results.Ok(new
            {
                id,
                role = RoleParse.Name(role),
                path,
                url = $"{appOrigin}{path}",
                note = "Previous share links for this role are now invalid.",
            });
        });

        group.MapDelete("/{workspaceId}/share-links/{role}", async (
            string workspaceId,
            string role,
            ClaimsPrincipal user,
            IWorkspaceAuthorizationService authorization,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();
            if (!await authorization.CanAdminAsync(workspaceId, userId.Value, cancellationToken))
            {
                return Results.Forbid();
            }

            if (!RoleParse.TryParse(role, out var parsed) || parsed == WorkspaceRole.Owner)
            {
                return Results.BadRequest(new { error = "role must be editor or viewer" });
            }

            await repository.RevokeShareLinkAsync(workspaceId, parsed, cancellationToken);
            return Results.NoContent();
        });

        return app;
    }

    private static async Task<IResult> IssueWsTicket(
        string workspaceId,
        string scopeId,
        ClaimsPrincipal user,
        IWorkspaceAuthorizationService authorization,
        IWsTicketService ticketService,
        CancellationToken cancellationToken)
    {
        var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
        if (userId is null) return Results.Unauthorized();

        if (!await authorization.CanReadAsync(workspaceId, userId.Value, cancellationToken))
        {
            return Results.Forbid();
        }

        var ticket = ticketService.IssueTicket(userId.Value.ToString(), workspaceId, scopeId);
        return Results.Ok(ticket);
    }
}

public static class JoinEndpoints
{
    public static IEndpointRouteBuilder MapJoinEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/join/{workspaceId}/{role}/{token}", async (
            string workspaceId,
            string role,
            string token,
            ClaimsPrincipal user,
            IWorkspaceRepository repository,
            CancellationToken cancellationToken) =>
        {
            var userId = AuthEndpoints.GetUserIdFromPrincipal(user);
            if (userId is null) return Results.Unauthorized();

            if (!RoleParse.TryParse(role, out var parsed) || parsed == WorkspaceRole.Owner)
            {
                return Results.BadRequest(new { error = "invalid role in share link" });
            }

            var link = await repository.FindActiveShareLinkAsync(workspaceId, parsed, token, cancellationToken);
            if (link is null)
            {
                return Results.NotFound(new { error = "Share link is invalid or has been revoked." });
            }

            await repository.UpsertMembershipAsync(workspaceId, userId.Value, link.Value.Role, cancellationToken);
            return Results.Ok(new
            {
                workspaceId = link.Value.WorkspaceId,
                role = RoleParse.Name(link.Value.Role),
            });
        }).RequireAuthorization();

        return app;
    }
}

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
        return app;
    }
}
