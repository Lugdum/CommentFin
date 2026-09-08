using System;
using System.ComponentModel.DataAnnotations;

namespace Jellyfin.Plugin.CommentTrack.Api.Dto;

/// <summary>Body of POST /CommentTrack/comments.</summary>
public sealed class CreateCommentRequest
{
    [Required]
    public Guid ItemId { get; set; }

    [Range(0, long.MaxValue)]
    public long PositionMs { get; set; }

    [Required]
    [StringLength(1000, MinimumLength = 1)]
    public string Body { get; set; } = string.Empty;
}
