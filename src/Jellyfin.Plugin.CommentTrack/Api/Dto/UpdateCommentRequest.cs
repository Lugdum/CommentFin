using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.CommentTrack.Api.Dto;

/// <summary>Body of PATCH /CommentTrack/comments/{id}.</summary>
public sealed class UpdateCommentRequest
{
    [Required]
    [StringLength(1000, MinimumLength = 1)]
    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;
}
