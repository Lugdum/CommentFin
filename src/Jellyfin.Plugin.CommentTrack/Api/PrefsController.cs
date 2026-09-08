using System;
using System.IO;
using System.Net.Mime;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Storage;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>
/// A viewer's overlay settings, synced across every device/browser they use -
/// same account, same comment display prefs everywhere. The server treats the
/// settings object as opaque JSON (only validates that it parses and isn't
/// unreasonably large) and PUT is a shallow MERGE, not a replace: the client
/// only ever sends the one field it just changed, so a field neither this nor
/// any other device has ever touched keeps tracking the admin's default
/// instead of being pinned to whatever it happened to resolve to on save.
/// </summary>
[ApiController]
[Authorize]
[Route("CommentTrack/prefs")]
public class PrefsController : ControllerBase
{
    private const int MaxBodyBytes = 8 * 1024;

    private readonly ICommentStore _store;

    public PrefsController(ICommentStore store)
    {
        _store = store;
    }

    /// <summary>Gets the calling user's saved settings, or 204 if they've never saved any.</summary>
    [HttpGet]
    [Produces(MediaTypeNames.Application.Json)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> Get(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId.Equals(Guid.Empty))
        {
            return Unauthorized();
        }

        var json = await _store.GetUserPrefsAsync(userId, cancellationToken).ConfigureAwait(false);
        return json is null ? NoContent() : Content(json, MediaTypeNames.Application.Json);
    }

    /// <summary>Merges the given fields into the calling user's saved settings.</summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> Put(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId.Equals(Guid.Empty))
        {
            return Unauthorized();
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

        var existingJson = await _store.GetUserPrefsAsync(userId, cancellationToken).ConfigureAwait(false);
        var merged = (existingJson is not null && JsonNode.Parse(existingJson) is JsonObject existing)
            ? existing
            : new JsonObject();
        foreach (var (key, value) in patch)
        {
            merged[key] = value?.DeepClone();
        }

        var mergedJson = merged.ToJsonString();
        if (mergedJson.Length > MaxBodyBytes)
        {
            return BadRequest("settings too large");
        }

        await _store.SetUserPrefsAsync(userId, mergedJson, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }

    /// <summary>Admin: wipe every viewer's saved settings so they all fall back to the
    /// current admin defaults (existing users included, not just future ones). Takes
    /// effect for each user on their next page load.</summary>
    [HttpPost("/CommentTrack/prefs/reset-all")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [Produces(MediaTypeNames.Application.Json)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> ResetAll(CancellationToken cancellationToken)
    {
        var cleared = await _store.ClearAllUserPrefsAsync(cancellationToken).ConfigureAwait(false);
        return Ok(new { cleared });
    }
}
