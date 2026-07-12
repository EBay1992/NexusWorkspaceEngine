using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Orbit.Gateway.Configuration;

namespace Orbit.Gateway.Services;

public sealed record WsTicketResponse(string Ticket, DateTimeOffset ExpiresAt, string RelayUrl);

public interface IWsTicketService
{
    WsTicketResponse IssueTicket(string userId, string workspaceId, string scopeId);
}

/// <summary>
/// Signs short-lived WS tickets consumed by the stateless relay (PAT-002 / SEC-001).
/// Claims must match <c>@orbit/yjs-protocol</c> validation: sub, workspaceId, scopeId, exp.
/// </summary>
public sealed class WsTicketService(IOptions<GatewayOptions> options) : IWsTicketService
{
    public WsTicketResponse IssueTicket(string userId, string workspaceId, string scopeId)
    {
        var expires = DateTime.UtcNow.AddMinutes(options.Value.WsTicketMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.Value.JwtSigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            claims:
            [
                new Claim("sub", userId),
                new Claim("workspaceId", workspaceId),
                new Claim("scopeId", scopeId),
            ],
            expires: expires,
            signingCredentials: credentials);

        var ticket = new JwtSecurityTokenHandler().WriteToken(token);
        return new WsTicketResponse(ticket, new DateTimeOffset(expires, TimeSpan.Zero), options.Value.RelayWsUrl);
    }
}
