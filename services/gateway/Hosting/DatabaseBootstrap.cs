using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Data;

namespace Orbit.Gateway.Hosting;

/// <summary>
/// Applies schema.sql on startup and optionally seeds the admin account from env vars.
/// </summary>
public sealed class DatabaseBootstrap(
    IOptions<GatewayOptions> options,
    ILogger<DatabaseBootstrap> logger) : IHostedService
{
    private static readonly Guid AdminUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

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

        var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL");
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD");
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
        {
            return;
        }

        const string upsertAdminSql = """
            INSERT INTO users (id, email, password_hash)
            VALUES (@Id, @Email, @PasswordHash)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

            INSERT INTO workspaces (id, title)
            VALUES ('main', 'Main workspace')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO workspace_members (workspace_id, user_id, role)
            VALUES ('main', @Id, 'owner')
            ON CONFLICT DO NOTHING;
            """;

        await connection.ExecuteAsync(
            new CommandDefinition(
                upsertAdminSql,
                new { Id = AdminUserId, Email = adminEmail.Trim(), PasswordHash = adminPassword },
                cancellationToken: cancellationToken));

        logger.LogInformation("Admin user ensured for {Email}", adminEmail.Trim());
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
