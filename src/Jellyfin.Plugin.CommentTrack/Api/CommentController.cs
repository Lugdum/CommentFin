using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Api.Dto;
using Jellyfin.Plugin.CommentTrack.Storage;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>Timestamped comment CRUD.</summary>
[ApiController]
[Authorize]
[Route("CommentTrack")]
[Produces(MediaTypeNames.Application.Json)]
public class CommentController : ControllerBase
{
    private readonly ICommentStore _store;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<CommentController> _logger;

    public CommentController(
        ICommentStore store,
        IUserManager userManager,
        ILibraryManager libraryManager,
        ILogger<CommentController> logger)
    {
        _store = store;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _logger = logger;
    }

    /// <summary>Gets all comments for a media item.</summary>
    [HttpGet("comments")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CommentDto>>> GetComments(
        [FromQuery, Required] Guid itemId,
        CancellationToken cancellationToken)
    {
        if (itemId.Equals(Guid.Empty))
        {
            return BadRequest("itemId is required");
        }

        if (await IsCallerBlockedAsync(cancellationToken).ConfigureAwait(false))
        {
            return Ok(Array.Empty<CommentDto>());
        }

        return Ok(await _store.GetForItemAsync(itemId, User.GetUserId(), cancellationToken).ConfigureAwait(false));
    }

    /// <summary>Gets every comment the calling user authored, across all media.</summary>
    [HttpGet("comments/mine")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CommentDto>>> GetMyComments(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId.Equals(Guid.Empty))
        {
            return Unauthorized();
        }

        if (await _store.IsUserBlockedAsync(userId, cancellationToken).ConfigureAwait(false))
        {
            return Ok(Array.Empty<CommentDto>());
        }

        var list = await _store.GetForUserAsync(userId, cancellationToken).ConfigureAwait(false);
        foreach (var c in list)
        {
            c.ItemName = DisplayName(c.ItemId);
        }

        return Ok(list);
    }

    /// <summary>Gets the most recent comments across every media item, for moderation. Admin only.</summary>
    [HttpGet("comments/all")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CommentDto>>> GetAllComments(CancellationToken cancellationToken)
    {
        const int limit = 500;
        var list = await _store.GetAllAsync(limit, User.GetUserId(), cancellationToken).ConfigureAwait(false);
        foreach (var c in list)
        {
            c.ItemName = DisplayName(c.ItemId);
        }

        return Ok(list);
    }

    /// <summary>Non-deleted comment counts for a batch of items - for library card badges.
    /// Capped so a client can't turn this into an unbounded scan.</summary>
    [HttpPost("comments/counts")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Dictionary<string, int>>> GetCounts(
        [FromBody] CountsRequest request,
        CancellationToken cancellationToken)
    {
        const int maxIds = 200;
        var ids = request.ItemIds;
        if (ids is null || ids.Count == 0)
        {
            return Ok(new Dictionary<string, int>());
        }

        if (ids.Count > maxIds)
        {
            return BadRequest($"at most {maxIds} itemIds per request");
        }

        if (await IsCallerBlockedAsync(cancellationToken).ConfigureAwait(false))
        {
            return Ok(new Dictionary<string, int>());
        }

        var counts = await _store.CountByItemsAsync(ids, cancellationToken).ConfigureAwait(false);
        var byString = new Dictionary<string, int>();
        foreach (var (id, count) in counts)
        {
            // "N" (32 hex, no hyphens) matches the format jellyfin-web puts in card data-id.
            byString[id.ToString("N", CultureInfo.InvariantCulture)] = count;
        }

        return Ok(byString);
    }

    /// <summary>Creates a comment at a timecode.</summary>
    [HttpPost("comments")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<CommentDto>> Create(
        [FromBody] CreateCommentRequest request,
        CancellationToken cancellationToken)
    {
        var config = Plugin.Instance!.Configuration;

        var userId = User.GetUserId();
        var user = userId.Equals(Guid.Empty) ? null : _userManager.GetUserById(userId);
        if (user is null)
        {
            return Unauthorized();
        }

        if (await _store.IsUserBlockedAsync(userId, cancellationToken).ConfigureAwait(false))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var isAdmin = User.IsAdministrator();
        if (!config.AllowAllUsersToPost && !isAdmin)
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        if (request.ItemId.Equals(Guid.Empty))
        {
            return BadRequest("itemId is required");
        }

        var body = (request.Body ?? string.Empty).Trim();
        if (body.Length == 0 || body.Length > config.MaxCommentLength)
        {
            return BadRequest($"body must be 1..{config.MaxCommentLength} characters");
        }

        if (request.PositionMs < 0)
        {
            return BadRequest("positionMs must be >= 0");
        }

        if (!isAdmin && config.RateLimitPerHour > 0)
        {
            var recent = await _store
                .CountRecentByUserAsync(userId, DateTime.UtcNow.AddHours(-1), cancellationToken)
                .ConfigureAwait(false);
            if (recent >= config.RateLimitPerHour)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, "rate limit reached");
            }
        }

        var created = await _store
            .AddAsync(request.ItemId, request.PositionMs, body, userId, user.Username, cancellationToken)
            .ConfigureAwait(false);
        created.Mine = true;

        _logger.LogDebug("Comment {Id} added on {ItemId} at {Pos}ms by {User}", created.Id, created.ItemId, created.PositionMs, user.Username);
        return CreatedAtAction(nameof(GetComments), new { itemId = request.ItemId }, created);
    }

    /// <summary>Edits a comment's text. Author or admin only.</summary>
    [HttpPatch("comments/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> Update(Guid id, [FromBody] UpdateCommentRequest request, CancellationToken cancellationToken)
    {
        var config = Plugin.Instance!.Configuration;
        var body = (request.Body ?? string.Empty).Trim();
        if (body.Length == 0 || body.Length > config.MaxCommentLength)
        {
            return BadRequest($"body must be 1..{config.MaxCommentLength} characters");
        }

        if (await IsCallerBlockedAsync(cancellationToken).ConfigureAwait(false))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var result = await _store
            .UpdateBodyAsync(id, body, User.GetUserId(), User.IsAdministrator(), cancellationToken)
            .ConfigureAwait(false);
        return Map(result);
    }

    /// <summary>Deletes a comment. Author or admin only.</summary>
    [HttpDelete("comments/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        if (await IsCallerBlockedAsync(cancellationToken).ConfigureAwait(false))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var result = await _store
            .SoftDeleteAsync(id, User.GetUserId(), User.IsAdministrator(), cancellationToken)
            .ConfigureAwait(false);
        return Map(result);
    }

    private ActionResult Map(MutationResult result) => result switch
    {
        MutationResult.Ok => NoContent(),
        MutationResult.Forbidden => StatusCode(StatusCodes.Status403Forbidden),
        _ => NotFound(),
    };

    /// <summary>True when an admin has blocked the calling user from the plugin.
    /// The endpoints treat a blocked caller as if the plugin were not installed:
    /// reads come back empty and writes are refused.</summary>
    private Task<bool> IsCallerBlockedAsync(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        return userId.Equals(Guid.Empty)
            ? Task.FromResult(false)
            : _store.IsUserBlockedAsync(userId, cancellationToken);
    }

    private string DisplayName(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null)
        {
            return "?";
        }

        if (item is Episode ep)
        {
            var s = ep.ParentIndexNumber is { } sn ? $"S{sn:00}" : string.Empty;
            var e = ep.IndexNumber is { } en ? $"E{en:00}" : string.Empty;
            var tag = string.Concat(s, e);
            return string.IsNullOrEmpty(ep.SeriesName)
                ? $"{tag} {ep.Name}".Trim()
                : $"{ep.SeriesName} {tag} · {ep.Name}".Trim();
        }

        return item.Name ?? "?";
    }
}
