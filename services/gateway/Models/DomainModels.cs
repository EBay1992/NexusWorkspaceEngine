namespace Orbit.Gateway.Models;

public enum WorkspaceRole
{
    Owner,
    Editor,
    Viewer,
}

public static class WorkspaceRoles
{
    public const string Owner = "owner";
    public const string Editor = "editor";
    public const string Viewer = "viewer";

    public static WorkspaceRole Parse(string role) => role switch
    {
        Owner => WorkspaceRole.Owner,
        Editor => WorkspaceRole.Editor,
        Viewer => WorkspaceRole.Viewer,
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, "unknown workspace role"),
    };
}

public sealed record UserRecord(Guid Id, string Email, string PasswordHash);

public sealed record WorkspaceMemberRecord(string WorkspaceId, Guid UserId, WorkspaceRole Role);

public sealed record WorkspaceSummary(string Id, string Title, string Role);

public sealed record WorkspaceMemberListItem(Guid UserId, string Email, string Role);

public sealed record WorkspaceShareLinkRecord(
    Guid Id,
    string WorkspaceId,
    WorkspaceRole Role,
    string TokenHash,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset? RevokedAt);

public sealed record SnapshotInsert(string WorkspaceId, string ScopeId, byte[] Payload, Guid UserId);
