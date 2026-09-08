using System;
using System.Linq;
using System.Security.Claims;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>
/// Minimal claim readers. Jellyfin's own <c>ClaimsPrincipalExtensions</c> and
/// <c>InternalClaimTypes</c> live in the internal <c>Jellyfin.Api</c> assembly,
/// which is not part of the <c>Jellyfin.Controller</c> package, so a plugin
/// cannot reference them. The claim strings below have been stable across
/// Jellyfin 10.x (verified against release-10.11.z <c>InternalClaimTypes.cs</c>).
/// </summary>
internal static class ClaimsExtensions
{
    private const string UserIdClaim = "Jellyfin-UserId";
    private const string IsApiKeyClaim = "Jellyfin-IsApiKey";
    private const string AdministratorRole = "Administrator";

    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = Value(user, UserIdClaim);
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    public static bool GetIsApiKey(this ClaimsPrincipal user)
        => bool.TryParse(Value(user, IsApiKeyClaim), out var v) && v;

    public static bool IsAdministrator(this ClaimsPrincipal user)
        => user.IsInRole(AdministratorRole);

    private static string? Value(ClaimsPrincipal user, string name)
        => user.Claims.FirstOrDefault(c => string.Equals(c.Type, name, StringComparison.OrdinalIgnoreCase))?.Value;
}
