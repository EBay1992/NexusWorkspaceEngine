using Npgsql;

namespace Orbit.Gateway.Data;

public static class ConnectionStringHelper
{
    public static string ToNpgsql(string databaseUrl)
    {
        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            return databaseUrl;
        }

        if (!databaseUrl.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !databaseUrl.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return EnsureSslDefaults(new NpgsqlConnectionStringBuilder(databaseUrl)).ConnectionString;
        }

        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
        };

        var query = uri.Query.TrimStart('?');
        if (!string.IsNullOrEmpty(query))
        {
            foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = pair.Split('=', 2);
                if (parts.Length != 2) continue;
                builder[parts[0]] = Uri.UnescapeDataString(parts[1]);
            }
        }

        return EnsureSslDefaults(builder).ConnectionString;
    }

    private static NpgsqlConnectionStringBuilder EnsureSslDefaults(NpgsqlConnectionStringBuilder builder)
    {
        // Render Postgres requires SSL; free-tier cold starts need a longer timeout.
        if (builder.SslMode == SslMode.Disable || builder.SslMode == SslMode.Prefer)
        {
            builder.SslMode = SslMode.Require;
        }

        builder.TrustServerCertificate = true;
        if (builder.Timeout < 30)
        {
            builder.Timeout = 30;
        }

        return builder;
    }
}
