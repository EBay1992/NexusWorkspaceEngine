using System.Data;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Npgsql;
using Orbit.Gateway.Models;
using Microsoft.Extensions.Options;
using Orbit.Gateway.Configuration;

namespace Orbit.Gateway.Data;

public interface IDbConnectionFactory
{
    Task<IDbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}

public sealed class NpgsqlConnectionFactory(IOptions<GatewayOptions> options) : IDbConnectionFactory
{
    public async Task<IDbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default)
    {
        var connection = new NpgsqlConnection(ConnectionStringHelper.ToNpgsql(options.Value.DatabaseUrl));
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}

public interface IWorkspaceRepository
{
    Task<UserRecord?> FindUserByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<UserRecord> CreateUserAsync(string email, string password, CancellationToken cancellationToken = default);
    Task UpsertMembershipAsync(string workspaceId, Guid userId, WorkspaceRole role, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WorkspaceMemberListItem>> ListMembersAsync(string workspaceId, CancellationToken cancellationToken = default);
    Task<WorkspaceMemberRecord?> FindMembershipAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<WorkspaceSummary?> FindWorkspaceForUserAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> WorkspaceExistsAsync(string workspaceId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WorkspaceSummary>> ListWorkspacesForUserAsync(Guid userId, CancellationToken cancellationToken = default);
    Task InsertSnapshotsAsync(IReadOnlyList<SnapshotInsert> snapshots, CancellationToken cancellationToken = default);

    Task<(Guid Id, string RawToken)> CreateOrRotateShareLinkAsync(
        string workspaceId,
        WorkspaceRole role,
        Guid createdBy,
        CancellationToken cancellationToken = default);

    Task<(Guid Id, string Role, DateTimeOffset CreatedAt)[]> ListActiveShareLinksAsync(
        string workspaceId,
        CancellationToken cancellationToken = default);

    Task<(string WorkspaceId, WorkspaceRole Role)?> FindActiveShareLinkAsync(
        string workspaceId,
        WorkspaceRole role,
        string rawToken,
        CancellationToken cancellationToken = default);

    Task RevokeShareLinkAsync(string workspaceId, WorkspaceRole role, CancellationToken cancellationToken = default);
}

public sealed class WorkspaceRepository(IDbConnectionFactory connectionFactory) : IWorkspaceRepository
{
    public async Task<UserRecord?> FindUserByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<UserRecord>(
            """
            SELECT id AS Id, email AS Email, password_hash AS PasswordHash
            FROM users
            WHERE email = @Email
            """,
            new { Email = email });
    }

    public async Task<UserRecord> CreateUserAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var id = Guid.NewGuid();
        await connection.ExecuteAsync(
            """
            INSERT INTO users (id, email, password_hash)
            VALUES (@Id, @Email, @PasswordHash)
            """,
            new { Id = id, Email = email.Trim().ToLowerInvariant(), PasswordHash = password });

        return new UserRecord(id, email.Trim().ToLowerInvariant(), password);
    }

    public async Task UpsertMembershipAsync(
        string workspaceId,
        Guid userId,
        WorkspaceRole role,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(
            """
            INSERT INTO workspace_members (workspace_id, user_id, role)
            VALUES (@WorkspaceId, @UserId, @Role)
            ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """,
            new { WorkspaceId = workspaceId, UserId = userId, Role = RoleToString(role) });
    }

    public async Task<IReadOnlyList<WorkspaceMemberListItem>> ListMembersAsync(
        string workspaceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<WorkspaceMemberListItem>(
            """
            SELECT u.id AS UserId, u.email AS Email, wm.role AS Role
            FROM workspace_members wm
            INNER JOIN users u ON u.id = wm.user_id
            WHERE wm.workspace_id = @WorkspaceId
            ORDER BY
              CASE wm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
              u.email
            """,
            new { WorkspaceId = workspaceId });
        return rows.AsList();
    }

    public async Task<WorkspaceMemberRecord?> FindMembershipAsync(
        string workspaceId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var row = await connection.QuerySingleOrDefaultAsync<MembershipRow>(
            """
            SELECT workspace_id AS WorkspaceId, user_id AS UserId, role AS Role
            FROM workspace_members
            WHERE workspace_id = @WorkspaceId AND user_id = @UserId
            """,
            new { WorkspaceId = workspaceId, UserId = userId });

        return row is null
            ? null
            : new WorkspaceMemberRecord(row.WorkspaceId, row.UserId, WorkspaceRoles.Parse(row.Role));
    }

    public async Task<IReadOnlyList<WorkspaceSummary>> ListWorkspacesForUserAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<WorkspaceSummary>(
            """
            SELECT w.id AS Id, w.title AS Title, wm.role AS Role
            FROM workspaces w
            INNER JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE wm.user_id = @UserId
            ORDER BY w.title
            """,
            new { UserId = userId });

        return rows.AsList();
    }

    public async Task<WorkspaceSummary?> FindWorkspaceForUserAsync(
        string workspaceId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<WorkspaceSummary>(
            """
            SELECT w.id AS Id, w.title AS Title, wm.role AS Role
            FROM workspaces w
            INNER JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE w.id = @WorkspaceId AND wm.user_id = @UserId
            """,
            new { WorkspaceId = workspaceId, UserId = userId });
    }

    public async Task<bool> WorkspaceExistsAsync(string workspaceId, CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<bool>(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = @WorkspaceId)",
            new { WorkspaceId = workspaceId });
    }

    public async Task<(Guid Id, string RawToken)> CreateOrRotateShareLinkAsync(
        string workspaceId,
        WorkspaceRole role,
        Guid createdBy,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var tx = await connection.BeginTransactionAsync(cancellationToken);

        await connection.ExecuteAsync(
            """
            UPDATE workspace_share_links
            SET revoked_at = NOW()
            WHERE workspace_id = @WorkspaceId AND role = @Role AND revoked_at IS NULL
            """,
            new { WorkspaceId = workspaceId, Role = RoleToString(role) },
            tx);

        var id = Guid.NewGuid();
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        var tokenHash = HashToken(rawToken);

        await connection.ExecuteAsync(
            """
            INSERT INTO workspace_share_links (id, workspace_id, role, token_hash, created_by)
            VALUES (@Id, @WorkspaceId, @Role, @TokenHash, @CreatedBy)
            """,
            new
            {
                Id = id,
                WorkspaceId = workspaceId,
                Role = RoleToString(role),
                TokenHash = tokenHash,
                CreatedBy = createdBy,
            },
            tx);

        await tx.CommitAsync(cancellationToken);
        return (id, rawToken);
    }

    public async Task<(Guid Id, string Role, DateTimeOffset CreatedAt)[]> ListActiveShareLinksAsync(
        string workspaceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<ShareLinkListRow>(
            """
            SELECT id AS Id, role AS Role, created_at AS CreatedAt
            FROM workspace_share_links
            WHERE workspace_id = @WorkspaceId AND revoked_at IS NULL
            ORDER BY role
            """,
            new { WorkspaceId = workspaceId });
        return rows.Select(r => (r.Id, r.Role, r.CreatedAt)).ToArray();
    }

    public async Task<(string WorkspaceId, WorkspaceRole Role)?> FindActiveShareLinkAsync(
        string workspaceId,
        WorkspaceRole role,
        string rawToken,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        var row = await connection.QuerySingleOrDefaultAsync<ShareLinkRow>(
            """
            SELECT workspace_id AS WorkspaceId, role AS Role
            FROM workspace_share_links
            WHERE workspace_id = @WorkspaceId
              AND role = @Role
              AND token_hash = @TokenHash
              AND revoked_at IS NULL
            """,
            new
            {
                WorkspaceId = workspaceId,
                Role = RoleToString(role),
                TokenHash = HashToken(rawToken),
            });

        return row is null ? null : (row.WorkspaceId, WorkspaceRoles.Parse(row.Role));
    }

    public async Task RevokeShareLinkAsync(
        string workspaceId,
        WorkspaceRole role,
        CancellationToken cancellationToken = default)
    {
        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(
            """
            UPDATE workspace_share_links
            SET revoked_at = NOW()
            WHERE workspace_id = @WorkspaceId AND role = @Role AND revoked_at IS NULL
            """,
            new { WorkspaceId = workspaceId, Role = RoleToString(role) });
    }

    public async Task InsertSnapshotsAsync(IReadOnlyList<SnapshotInsert> snapshots, CancellationToken cancellationToken = default)
    {
        if (snapshots.Count == 0) return;

        await using var connection = (NpgsqlConnection)await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        const string sql = """
            INSERT INTO workspace_snapshots (workspace_id, scope_id, payload)
            VALUES (@WorkspaceId, @ScopeId, @Payload)
            """;

        foreach (var snapshot in snapshots)
        {
            await connection.ExecuteAsync(sql, new
            {
                snapshot.WorkspaceId,
                snapshot.ScopeId,
                snapshot.Payload,
            }, transaction);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private static string RoleToString(WorkspaceRole role) => role switch
    {
        WorkspaceRole.Owner => WorkspaceRoles.Owner,
        WorkspaceRole.Editor => WorkspaceRoles.Editor,
        WorkspaceRole.Viewer => WorkspaceRoles.Viewer,
        _ => throw new ArgumentOutOfRangeException(nameof(role)),
    };

    internal static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed class MembershipRow
    {
        public string WorkspaceId { get; init; } = string.Empty;
        public Guid UserId { get; init; }
        public string Role { get; init; } = string.Empty;
    }

    private sealed class ShareLinkRow
    {
        public string WorkspaceId { get; init; } = string.Empty;
        public string Role { get; init; } = string.Empty;
    }

    private sealed class ShareLinkListRow
    {
        public Guid Id { get; init; }
        public string Role { get; init; } = string.Empty;
        public DateTimeOffset CreatedAt { get; init; }
    }
}
