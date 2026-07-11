namespace Orbit.Gateway.Configuration;

public sealed class GatewayOptions
{
    public const string SectionName = "Gateway";

    public string DatabaseUrl { get; set; } = string.Empty;
    public string JwtSigningKey { get; set; } = string.Empty;
    public string RelayWsUrl { get; set; } = "ws://localhost:1234/orbit";
    public string WebOrigin { get; set; } = "http://localhost:3000";
    public int AccessTokenMinutes { get; set; } = 60;
    public int WsTicketMinutes { get; set; } = 5;
}
