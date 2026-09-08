using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.CommentTrack.Configuration;

/// <summary>
/// Server-wide plugin configuration. The <c>Default*</c> properties seed a
/// viewer's overlay settings the first time they see it - every viewer can
/// still change their own in the in-player panel, which then overrides these
/// server defaults from then on (see <c>client/src/settings.js</c>).
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Allow all users to post comments. If false, admins only.</summary>
    public bool AllowAllUsersToPost { get; set; } = true;

    /// <summary>Max comments a single user may create per rolling hour.</summary>
    public int RateLimitPerHour { get; set; } = 60;

    /// <summary>Max length of a comment body, in characters.</summary>
    public int MaxCommentLength { get; set; } = 200;

    /// <summary>Whether the overlay is on for a viewer who has never chosen.</summary>
    public bool DefaultEnabled { get; set; }

    /// <summary>"scroll" | "fixed-top" | "fixed-bottom".</summary>
    public string DefaultDisplayMode { get; set; } = "fixed-top";

    /// <summary>Seconds a fixed (non-scrolling) comment stays on screen.</summary>
    public double DefaultDurationSec { get; set; } = 5;

    /// <summary>Scroll speed multiplier.</summary>
    public double DefaultSpeed { get; set; } = 1.0;

    /// <summary>Comment text size, in pixels.</summary>
    public int DefaultFontSize { get; set; } = 24;

    /// <summary>Overlay opacity, 0..1.</summary>
    public double DefaultOpacity { get; set; } = 0.9;

    /// <summary>Show the author's name before each comment.</summary>
    public bool DefaultShowAuthor { get; set; } = true;

    /// <summary>"light" | "dark" - background of the comment bubble.</summary>
    public string DefaultCardTheme { get; set; } = "dark";

    /// <summary>Seconds a new comment's timecode is backdated, to compensate for reaction + click time.</summary>
    public double DefaultComposeOffsetSec { get; set; } = 1;

    /// <summary>Single-character keyboard shortcut that opens the compose box.</summary>
    public string DefaultComposeShortcutKey { get; set; } = "c";
}
