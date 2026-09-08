using Jellyfin.Plugin.CommentTrack.Storage;
using Jellyfin.Plugin.CommentTrack.Web;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.CommentTrack;

/// <summary>Registers the plugin's services with the host DI container.</summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<ICommentStore, SqliteCommentStore>();

        // Registered explicitly so the host resolves its ILogger dependency;
        // it also runs once on the startup trigger to wire up File Transformation.
        serviceCollection.AddSingleton<IScheduledTask, RegisterTransformationTask>();
    }
}
