using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Mime;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Storage;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>
/// Per-user administration for the plugin config page. Two independent levers:
///  - the overlay on/off switch, which just seeds that user's own `enabled`
///    setting (they can still change it themselves afterwards);
///  - a hard block, which turns the plugin into a no-op for that user on both
///    the client and the server. Comments they already posted are kept.
/// </summary>
[ApiController]
[Authorize(Policy = Policies.RequiresElevation)]
[Route("CommentTrack/admin")]
[Produces(MediaTypeNames.Application.Json)]
public class AdminController : ControllerBase
{
    private const int MaxBodyBytes = 1024;

    private readonly ICommentStore _store;
    private readonly IUserManager _userManager;

    public AdminController(ICommentStore store, IUserManager userManager)
    {
        _store = store;
        _userManager = userManager;
    }

    /// <summary>Every Jellyfin user with their current plugin access.</summary>
    [HttpGet("users")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminUserDto>>> GetUsers(CancellationToken cancellationToken)
    {
        var blocked = new HashSet<Guid>(await _store.GetBlockedUserIdsAsync(cancellationToken).ConfigureAwait(false));
        var result = new List<AdminUserDto>();

        foreach (var user in _userManager.GetUsers().OrderBy(u => u.Username, StringComparer.OrdinalIgnoreCase))
        {
            var prefsJson = await _store.GetUserPrefsAsync(user.Id, cancellationToken).ConfigureAwait(false);
            result.Add(new AdminUserDto
            {
                Id = user.Id,
                Name = user.Username,
                OverlayEnabled = ReadEnabledPref(prefsJson),
                Blocked = blocked.Contains(user.Id),
            });
        }

        return Ok(result);
    }

    /// <summary>
    /// Updates one user's plugin access. Body is a small JSON object; only the
    /// keys present are changed:
    ///  - <c>overlayEnabled</c>: <c>true</c> / <c>false</c> writes that user's
    ///    own overlay switch, <c>null</c> clears it so they follow the default;
    ///  - <c>blocked</c>: <c>true</c> / <c>false</c> sets or lifts the hard block.
    /// </summary>
    [HttpPut("users/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> SetUserPolicy(Guid id, CancellationToken cancellationToken)
    {
        if (_userManager.GetUserById(id) is null)
        {
            return NotFound();
        }

        string body;
        using (var reader = new StreamReader(Request.Body))
        {
            body = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(body) || body.Length > MaxBodyBytes)
        {
            return BadRequest("body must be a small JSON object");
        }

        JsonObject patch;
        try
        {
            patch = JsonNode.Parse(body) as JsonObject ?? throw new JsonException();
        }
        catch (JsonException)
        {
            return BadRequest("body must be a JSON object");
        }

        if (patch.TryGetPropertyValue("blocked", out var blockedNode))
        {
            if (blockedNode is not JsonValue bv || !bv.TryGetValue<bool>(out var blocked))
            {
                return BadRequest("blocked must be true or false");
            }

            await _store.SetUserBlockedAsync(id, blocked, cancellationToken).ConfigureAwait(false);
        }

        if (patch.TryGetPropertyValue("overlayEnabled", out var overlayNode))
        {
            bool? enabled;
            if (overlayNode is null)
            {
                enabled = null;
            }
            else if (overlayNode is JsonValue ov && ov.TryGetValue<bool>(out var e))
            {
                enabled = e;
            }
            else
            {
                return BadRequest("overlayEnabled must be true, false or null");
            }

            await SetOverlayEnabledAsync(id, enabled, cancellationToken).ConfigureAwait(false);
        }

        return NoContent();
    }

    /// <summary>Reads the boolean <c>enabled</c> field out of a user's stored prefs
    /// JSON, or null if they have no prefs or have never set that field.</summary>
    private static bool? ReadEnabledPref(string? prefsJson)
    {
        if (prefsJson is not null
            && JsonNode.Parse(prefsJson) is JsonObject obj
            && obj.TryGetPropertyValue("enabled", out var node)
            && node is JsonValue value
            && value.TryGetValue<bool>(out var enabled))
        {
            return enabled;
        }

        return null;
    }

    /// <summary>Sets or clears just the <c>enabled</c> field in a user's prefs,
    /// leaving anything else they have saved untouched.</summary>
    private async Task SetOverlayEnabledAsync(Guid userId, bool? enabled, CancellationToken cancellationToken)
    {
        var existingJson = await _store.GetUserPrefsAsync(userId, cancellationToken).ConfigureAwait(false);
        var obj = existingJson is not null && JsonNode.Parse(existingJson) is JsonObject existing
            ? existing
            : new JsonObject();

        if (enabled is null)
        {
            obj.Remove("enabled");
        }
        else
        {
            obj["enabled"] = enabled.Value;
        }

        await _store.SetUserPrefsAsync(userId, obj.ToJsonString(), cancellationToken).ConfigureAwait(false);
    }

    /// <summary>One Jellyfin user and their current plugin access.</summary>
    public sealed class AdminUserDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        /// <summary>The user's own overlay switch: true, false, or null when they
        /// have never set it and so follow the admin default.</summary>
        [JsonPropertyName("overlayEnabled")]
        public bool? OverlayEnabled { get; set; }

        [JsonPropertyName("blocked")]
        public bool Blocked { get; set; }
    }
}
