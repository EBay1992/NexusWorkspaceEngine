using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Data;

namespace Orbit.Gateway.Hosting;

/// <summary>
/// Applies schema.sql on startup and seeds demo role accounts (+ optional admin).
/// </summary>
public sealed class DatabaseBootstrap(
    IOptions<GatewayOptions> options,
    ILogger<DatabaseBootstrap> logger) : IHostedService
{
    private static readonly Guid OwnerUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid EditorUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ViewerUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid OperatorUserId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var connectionString = ConnectionStringHelper.ToNpgsql(options.Value.DatabaseUrl);
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        var schemaPath = Path.Combine(AppContext.BaseDirectory, "Sql", "schema.sql");
        if (File.Exists(schemaPath))
        {
            var schemaSql = await File.ReadAllTextAsync(schemaPath, cancellationToken);
            await connection.ExecuteAsync(new CommandDefinition(schemaSql, cancellationToken: cancellationToken));
            logger.LogInformation("Database schema applied");
        }
        else
        {
            logger.LogWarning("Schema file not found at {SchemaPath}", schemaPath);
        }

        await connection.ExecuteAsync(
            new CommandDefinition(
                """
                INSERT INTO workspaces (id, title)
                VALUES ('main', 'Main workspace')
                ON CONFLICT (id) DO NOTHING;
                """,
                cancellationToken: cancellationToken));

        await UpsertUserMembershipAsync(connection, OwnerUserId, "owner@orbit.local", "demo", "owner", cancellationToken);
        await UpsertUserMembershipAsync(connection, EditorUserId, "editor@orbit.local", "demo", "editor", cancellationToken);
        await UpsertUserMembershipAsync(connection, ViewerUserId, "viewer@orbit.local", "demo", "viewer", cancellationToken);
        logger.LogInformation("Demo users ensured: owner/editor/viewer @orbit.local");

        var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL");
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD");
        if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword)
            && !string.Equals(adminEmail.Trim(), "owner@orbit.local", StringComparison.OrdinalIgnoreCase))
        {
            await UpsertUserMembershipAsync(
                connection,
                OperatorUserId,
                adminEmail.Trim(),
                adminPassword,
                "owner",
                cancellationToken);
            logger.LogInformation("Operator admin ensured for {Email}", adminEmail.Trim());
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task UpsertUserMembershipAsync(
        NpgsqlConnection connection,
        Guid userId,
        string email,
        string password,
        string role,
        CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(
            new CommandDefinition(
                """
                INSERT INTO users (id, email, password_hash)
                VALUES (@Id, @Email, @PasswordHash)
                ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES ('main', @Id, @Role)
                ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
                """,
                new { Id = userId, Email = email, PasswordHash = password, Role = role },
                cancellationToken: cancellationToken));
    }
}
