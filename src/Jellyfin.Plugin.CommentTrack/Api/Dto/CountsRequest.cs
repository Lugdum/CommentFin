using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.CommentTrack.Api.Dto;

/// <summary>Body of POST /CommentTrack/comments/counts.</summary>
public sealed class CountsRequest
{
    [JsonPropertyName("itemIds")]
    public List<Guid> ItemIds { get; set; } = new();
}
