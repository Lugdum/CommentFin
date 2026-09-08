using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.CommentTrack.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.CommentTrack;

/// <summary>
/// The CommentFin plugin entry point. Internal namespace/assembly name and
/// route prefix stay "CommentTrack" (the project's original working name) -
/// only the user-facing display name changed; renaming the internals would
/// touch every file for zero functional benefit.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>Initializes a new instance of the <see cref="Plugin"/> class.</summary>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>Gets the current plugin instance.</summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "CommentFin";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("fa318865-64a9-4fcf-93b4-8462cf4d25d5");

    /// <inheritdoc />
    public override string Description =>
        "Timestamped collaborative comments shown as a danmaku overlay on the video.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = "commenttrack",
            EmbeddedResourcePath = string.Format(
                CultureInfo.InvariantCulture,
                "{0}.Configuration.configPage.html",
                GetType().Namespace),
        },
    };
}
