using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Data;
using Orbit.Gateway.Endpoints;
using Orbit.Gateway.Hosting;
using Orbit.Gateway.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<GatewayOptions>(options =>
{
    options.DatabaseUrl = ReadEnv("DATABASE_URL", builder.Configuration);
    options.JwtSigningKey = ReadEnv("JWT_SIGNING_KEY", builder.Configuration);
    options.RelayWsUrl = ReadEnv("RELAY_WS_URL", builder.Configuration, "ws://localhost:1234/orbit");
    options.WebOrigin = ReadEnv("NEXT_PUBLIC_APP_URL", builder.Configuration, "http://localhost:3000");
});

var gatewayOptions = builder.Configuration.GetSection(GatewayOptions.SectionName).Get<GatewayOptions>() ?? new GatewayOptions();
gatewayOptions.DatabaseUrl = ReadEnv("DATABASE_URL", builder.Configuration);
gatewayOptions.JwtSigningKey = ReadEnv("JWT_SIGNING_KEY", builder.Configuration);
gatewayOptions.RelayWsUrl = ReadEnv("RELAY_WS_URL", builder.Configuration, "ws://localhost:1234/orbit");
gatewayOptions.WebOrigin = ReadEnv("NEXT_PUBLIC_APP_URL", builder.Configuration, "http://localhost:3000");

if (string.IsNullOrWhiteSpace(gatewayOptions.JwtSigningKey) || gatewayOptions.JwtSigningKey.Length < 32)
{
    throw new InvalidOperationException("JWT_SIGNING_KEY must be at least 32 characters.");
}

if (string.IsNullOrWhiteSpace(gatewayOptions.DatabaseUrl))
{
    throw new InvalidOperationException("DATABASE_URL is required.");
}

builder.Services.AddSingleton(Microsoft.Extensions.Options.Options.Create(gatewayOptions));
builder.Services.AddSingleton<IDbConnectionFactory, NpgsqlConnectionFactory>();
builder.Services.AddScoped<IWorkspaceRepository, WorkspaceRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IWorkspaceAuthorizationService, WorkspaceAuthorizationService>();
builder.Services.AddSingleton<IWsTicketService, WsTicketService>();
builder.Services.AddSingleton<ISnapshotIngestionService, SnapshotIngestionService>();
builder.Services.AddHostedService<DatabaseBootstrap>();
builder.Services.AddHostedService<SnapshotWorker>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(gatewayOptions.JwtSigningKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(gatewayOptions.WebOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapWorkspaceEndpoints();
app.MapJoinEndpoints();

app.Run();

static string ReadEnv(string name, ConfigurationManager configuration, string fallback = "")
{
    return Environment.GetEnvironmentVariable(name)
        ?? configuration[name]
        ?? fallback;
}

// Expose Program for WebApplicationFactory-style tests if needed later.
public partial class Program;
