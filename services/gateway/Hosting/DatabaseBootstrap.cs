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

        await using var connection = await OpenWithRetryAsync(connectionString, cancellationToken);

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

    private async Task<NpgsqlConnection> OpenWithRetryAsync(string connectionString, CancellationToken cancellationToken)
    {
        const int maxAttempts = 8;
        Exception? last = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync(cancellationToken);
                if (attempt > 1)
                {
                    logger.LogInformation("Connected to database on attempt {Attempt}", attempt);
                }

                return connection;
            }
            catch (Exception ex) when (ex is NpgsqlException or TimeoutException or OperationCanceledException)
            {
                last = ex;
                logger.LogWarning(ex, "Database open attempt {Attempt}/{Max} failed", attempt, maxAttempts);
                if (attempt == maxAttempts) break;
                await Task.Delay(TimeSpan.FromSeconds(Math.Min(2 * attempt, 10)), cancellationToken);
            }
        }

        throw new InvalidOperationException("Unable to open database connection after retries.", last);
    }

    private static async Task UpsertUserMembershipAsync(
        NpgsqlConnection connection,
        Guid preferredId,
        string email,
        string password,
        string role,
        CancellationToken cancellationToken)
    {
        // Resolve by email so we never collide with an older row using the preferred UUID.
        var existingId = await connection.ExecuteScalarAsync<Guid?>(
            new CommandDefinition(
                "SELECT id FROM users WHERE email = @Email",
                new { Email = email },
                cancellationToken: cancellationToken));

        var userId = existingId ?? preferredId;

        if (existingId is null)
        {
            var idTaken = await connection.ExecuteScalarAsync<bool>(
                new CommandDefinition(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE id = @Id)",
                    new { Id = preferredId },
                    cancellationToken: cancellationToken));
            if (idTaken)
            {
                userId = Guid.NewGuid();
            }

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    INSERT INTO users (id, email, password_hash)
                    VALUES (@Id, @Email, @PasswordHash)
                    """,
                    new { Id = userId, Email = email, PasswordHash = password },
                    cancellationToken: cancellationToken));
        }
        else
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE users SET password_hash = @PasswordHash WHERE id = @Id
                    """,
                    new { Id = userId, PasswordHash = password },
                    cancellationToken: cancellationToken));
        }

        await connection.ExecuteAsync(
            new CommandDefinition(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES ('main', @Id, @Role)
                ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
                """,
                new { Id = userId, Role = role },
                cancellationToken: cancellationToken));
    }
}
