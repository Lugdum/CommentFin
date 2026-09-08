using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Api.Dto;

namespace Jellyfin.Plugin.CommentTrack.Storage;

/// <summary>Outcome of an ownership-checked mutation.</summary>
public enum MutationResult
{
    /// <summary>Applied.</summary>
    Ok,

    /// <summary>No such (non-deleted) comment.</summary>
    NotFound,

    /// <summary>Comment exists but the caller may not touch it.</summary>
    Forbidden,
}

/// <summary>Persistence for timestamped comments.</summary>
public interface ICommentStore
{
    /// <summary>All non-deleted comments for a media item, ordered by timecode.</summary>
    Task<IReadOnlyList<CommentDto>> GetForItemAsync(Guid itemId, Guid callerId, CancellationToken cancellationToken);

    /// <summary>All non-deleted comments authored by a user, newest first.</summary>
    Task<IReadOnlyList<CommentDto>> GetForUserAsync(Guid userId, CancellationToken cancellationToken);

    /// <summary>The most recent non-deleted comments across every item, newest first - for moderation.</summary>
    Task<IReadOnlyList<CommentDto>> GetAllAsync(int limit, Guid callerId, CancellationToken cancellationToken);

    /// <summary>Non-deleted comment counts for a set of items (only those actually asked about).</summary>
    Task<IReadOnlyDictionary<Guid, int>> CountByItemsAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken);

    /// <summary>Adds a comment and returns it.</summary>
    Task<CommentDto> AddAsync(
        Guid itemId,
        long positionMs,
        string body,
        Guid userId,
        string userName,
        CancellationToken cancellationToken);

    /// <summary>Counts a user's comments created at or after <paramref name="sinceUtc"/> (for rate limiting).</summary>
    Task<int> CountRecentByUserAsync(Guid userId, DateTime sinceUtc, CancellationToken cancellationToken);

    /// <summary>Replaces a comment's body. Allowed for the author or an admin.</summary>
    Task<MutationResult> UpdateBodyAsync(Guid commentId, string body, Guid callerId, bool callerIsAdmin, CancellationToken cancellationToken);

    /// <summary>Marks a comment deleted. Allowed for the author or an admin.</summary>
    Task<MutationResult> SoftDeleteAsync(Guid commentId, Guid callerId, bool callerIsAdmin, CancellationToken cancellationToken);

    /// <summary>The viewer's synced overlay settings (opaque JSON), or null if never saved.</summary>
    Task<string?> GetUserPrefsAsync(Guid userId, CancellationToken cancellationToken);

    /// <summary>Replaces the viewer's synced overlay settings (opaque JSON).</summary>
    Task SetUserPrefsAsync(Guid userId, string json, CancellationToken cancellationToken);

    /// <summary>Deletes every viewer's saved settings so they all fall back to the admin defaults again. Returns the number cleared.</summary>
    Task<int> ClearAllUserPrefsAsync(CancellationToken cancellationToken);

    /// <summary>Whether an admin has blocked this user from the plugin entirely.</summary>
    Task<bool> IsUserBlockedAsync(Guid userId, CancellationToken cancellationToken);

    /// <summary>Sets or clears the admin block on a user.</summary>
    Task SetUserBlockedAsync(Guid userId, bool blocked, CancellationToken cancellationToken);

    /// <summary>The user ids an admin has currently blocked from the plugin.</summary>
    Task<IReadOnlyCollection<Guid>> GetBlockedUserIdsAsync(CancellationToken cancellationToken);
}
