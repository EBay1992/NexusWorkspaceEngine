using System.Security.Claims;
using Orbit.Gateway.Data;
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

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
        return app;
    }
}
