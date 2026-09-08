using System;

namespace Jellyfin.Plugin.CommentTrack.Web;

/// <summary>
/// Callback invoked by the File Transformation plugin for every served
/// <c>index.html</c>. FT builds a JSON object <c>{ "contents": "&lt;file&gt;" }</c>,
/// deserialises it into <see cref="TransformPayload"/> (Newtonsoft, case-insensitive
/// name match), invokes the method below, and writes the returned string back as
/// the response body.
///
/// Contract (FT 2.3.0.0 → 2.5.11.0, verified against tag 2.5.11.0):
///  - method must be <c>public static</c>, exactly one parameter, no overloads;
///  - must return a non-null <see cref="string"/> (null =&gt; NRE inside FT);
///  - must be idempotent - the same file is transformed repeatedly and the
///    pipeline loops until no new transformation registers.
/// </summary>
public static class WebTransformations
{
    private const string Marker = "<!-- comment-track inject -->";

    private const string ScriptTag =
        Marker + "\n<script defer src=\"/CommentTrack/client/comment-track.bundle.js\"></script>\n";

    /// <summary>Injects the overlay bundle just before <c>&lt;/body&gt;</c>.</summary>
    public static string InjectScript(TransformPayload input)
    {
        var html = input.Contents;
        if (string.IsNullOrEmpty(html) || html.Contains(Marker, StringComparison.Ordinal))
        {
            return html ?? string.Empty;
        }

        var i = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        return i < 0 ? html : string.Concat(html.AsSpan(0, i), ScriptTag, html.AsSpan(i));
    }
}

/// <summary>Shape FT deserialises the file into. The property must be named
/// <c>Contents</c> - FT keys the JSON as lowercase <c>contents</c> and matches
/// case-insensitively via Newtonsoft.</summary>
public sealed class TransformPayload
{
    public string? Contents { get; set; }
}
