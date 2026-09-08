using System;
using System.Net.Mime;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>Read-only subset of the plugin config the overlay needs at load time.</summary>
[ApiController]
[Authorize]
[Route("CommentTrack")]
[Produces(MediaTypeNames.Application.Json)]
public class PublicConfigController : ControllerBase
{
    private readonly ICommentStore _store;

    public PublicConfigController(ICommentStore store)
    {
        _store = store;
    }

    /// <summary>Gets the client-facing configuration for the calling user.</summary>
    [HttpGet("config")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<PublicConfig>> GetConfig(CancellationToken cancellationToken)
    {
        var c = Plugin.Instance!.Configuration;
        var userId = User.GetUserId();
        var blocked = !userId.Equals(Guid.Empty)
            && await _store.IsUserBlockedAsync(userId, cancellationToken).ConfigureAwait(false);

        return Ok(new PublicConfig
        {
            Blocked = blocked,
            MaxCommentLength = c.MaxCommentLength,
            AllowAllUsersToPost = c.AllowAllUsersToPost,
            Defaults = new ClientDefaults
            {
                Enabled = c.DefaultEnabled,
                DisplayMode = c.DefaultDisplayMode,
                DurationSec = c.DefaultDurationSec,
                Speed = c.DefaultSpeed,
                FontSize = c.DefaultFontSize,
                Opacity = c.DefaultOpacity,
                ShowAuthor = c.DefaultShowAuthor,
                CardTheme = c.DefaultCardTheme,
                ComposeOffsetSec = c.DefaultComposeOffsetSec,
                ComposeShortcutKey = c.DefaultComposeShortcutKey,
            },
        });
    }

    /// <summary>Client-facing config shape.</summary>
    public sealed class PublicConfig
    {
        /// <summary>True when an admin has blocked this user from the plugin; the
        /// client then does nothing at all for them.</summary>
        [JsonPropertyName("blocked")]
        public bool Blocked { get; set; }

        [JsonPropertyName("maxCommentLength")]
        public int MaxCommentLength { get; set; }

        [JsonPropertyName("allowAllUsersToPost")]
        public bool AllowAllUsersToPost { get; set; }

        /// <summary>Starting point for a viewer's own overlay settings - see
        /// <c>client/src/settings.js</c>, which lets an explicit per-viewer
        /// choice override any of these.</summary>
        [JsonPropertyName("defaults")]
        public ClientDefaults Defaults { get; set; } = new();
    }

    /// <summary>Mirrors the shape of <c>client/src/settings.js</c>' settings object.</summary>
    public sealed class ClientDefaults
    {
        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; }

        [JsonPropertyName("displayMode")]
        public string DisplayMode { get; set; } = "fixed-top";

        [JsonPropertyName("durationSec")]
        public double DurationSec { get; set; }

        [JsonPropertyName("speed")]
        public double Speed { get; set; }

        [JsonPropertyName("fontSize")]
        public int FontSize { get; set; }

        [JsonPropertyName("opacity")]
        public double Opacity { get; set; }

        [JsonPropertyName("showAuthor")]
        public bool ShowAuthor { get; set; }

        [JsonPropertyName("cardTheme")]
        public string CardTheme { get; set; } = "dark";

        [JsonPropertyName("composeOffsetSec")]
        public double ComposeOffsetSec { get; set; }

        [JsonPropertyName("composeShortcutKey")]
        public string ComposeShortcutKey { get; set; } = "c";
    }
}
