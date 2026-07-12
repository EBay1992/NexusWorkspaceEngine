using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Options;
using Orbit.Gateway.Configuration;
using Orbit.Gateway.Services;
using Xunit;

namespace Orbit.Gateway.Tests;

public class WsTicketTests
{
  [Fact]
  public void IssueTicket_contains_required_claims_and_ttl()
  {
    var options = Options.Create(new GatewayOptions
    {
      JwtSigningKey = "integration-test-signing-key-32-bytes-x",
      WsTicketMinutes = 5,
      RelayWsUrl = "ws://localhost:1234/orbit",
    });

    var service = new WsTicketService(options);
    var before = DateTimeOffset.UtcNow;
    var response = service.IssueTicket("user-1", "demo", "default");
    var after = DateTimeOffset.UtcNow.AddMinutes(5).AddSeconds(5);

    Assert.False(string.IsNullOrWhiteSpace(response.Ticket));
    Assert.Equal("ws://localhost:1234/orbit", response.RelayUrl);
    Assert.InRange(response.ExpiresAt, before.AddMinutes(4), after);

    var handler = new JwtSecurityTokenHandler();
    var token = handler.ReadJwtToken(response.Ticket);

    Assert.Equal("user-1", token.Claims.First(c => c.Type == "sub").Value);
    Assert.Equal("demo", token.Claims.First(c => c.Type == "workspaceId").Value);
    Assert.Equal("default", token.Claims.First(c => c.Type == "scopeId").Value);
  }
}
