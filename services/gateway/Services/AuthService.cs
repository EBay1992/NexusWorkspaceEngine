using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Data;
using Orbit.Gateway.Models;

namespace Orbit.Gateway.Services;

public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt);

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);
    string CreateAccessToken(Guid userId, string email);
}

public sealed class AuthService(
    IWorkspaceRepository repository,
    IOptions<GatewayOptions> options,
    ILogger<AuthService> logger) : IAuthService
{
    public async Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var user = await repository.FindUserByEmailAsync(request.Email, cancellationToken);
        if (user is null)
        {
            logger.LogWarning("login failed for unknown email {Email}", request.Email);
            return null;
        }

        // Dev stub: password_hash stores plaintext for the seeded demo user.
        if (user.PasswordHash != request.Password)
        {
            logger.LogWarning("login failed for {Email}", request.Email);
            return null;
        }

        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(options.Value.AccessTokenMinutes);
        return new LoginResponse(CreateAccessToken(user.Id, user.Email), expiresAt);
    }

    public string CreateAccessToken(Guid userId, string email)
    {
        var expires = DateTime.UtcNow.AddMinutes(options.Value.AccessTokenMinutes);
        var credentials = SigningCredentials();

        var token = new JwtSecurityToken(
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, email),
            ],
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    internal SigningCredentials SigningCredentials()
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.Value.JwtSigningKey));
        return new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    }
}
