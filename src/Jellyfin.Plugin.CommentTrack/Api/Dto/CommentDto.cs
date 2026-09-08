using System;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.CommentTrack.Api.Dto;

/// <summary>A comment as returned to the client. Explicit JSON names so the wire
/// shape does not depend on the server's serializer casing.</summary>
public sealed class CommentDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("itemId")]
    public Guid ItemId { get; set; }

    /// <summary>Author's user id - lets the client build their avatar URL.</summary>
    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    /// <summary>Display name of the media (filled only for the "my comments" list).</summary>
    [JsonPropertyName("itemName")]
    public string? ItemName { get; set; }

    /// <summary>Timecode within the media, in milliseconds.</summary>
    [JsonPropertyName("positionMs")]
    public long PositionMs { get; set; }

    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;

    [JsonPropertyName("userName")]
    public string UserName { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    /// <summary>True when the calling user authored this comment (may edit / delete it).</summary>
    [JsonPropertyName("mine")]
    public bool Mine { get; set; }
}
