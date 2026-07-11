using System.Data;
using Dapper;
using Npgsql;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Models;
using Microsoft.Extensions.Options;

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
    Task<WorkspaceMemberRecord?> FindMembershipAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<WorkspaceSummary?> FindWorkspaceForUserAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WorkspaceSummary>> ListWorkspacesForUserAsync(Guid userId, CancellationToken cancellationToken = default);
    Task InsertSnapshotsAsync(IReadOnlyList<SnapshotInsert> snapshots, CancellationToken cancellationToken = default);
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

    private sealed class MembershipRow
    {
        public string WorkspaceId { get; init; } = string.Empty;
        public Guid UserId { get; init; }
        public string Role { get; init; } = string.Empty;
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
}
