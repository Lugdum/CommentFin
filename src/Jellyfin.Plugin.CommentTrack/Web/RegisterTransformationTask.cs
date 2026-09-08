using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CommentTrack.Web;

/// <summary>
/// Registers our <c>index.html</c> transformation with the File Transformation
/// plugin. Runs on the startup trigger (after the host and every plugin have
/// loaded) - FT lives in its own <see cref="AssemblyLoadContext"/> and offers no
/// load-order guarantee, so this must NOT run from the plugin constructor or
/// from <c>IPluginServiceRegistrator</c>.
///
/// The payload <c>JObject</c> is built via <c>JObject.Parse</c> on FT's *own*
/// <c>Newtonsoft.Json.Linq.JObject</c> type (obtained from the target method's
/// parameter type), so the argument's assembly identity matches FT's load
/// context - passing a <c>JObject</c> from this plugin's own Newtonsoft copy
/// throws an argument-type mismatch across the ALC boundary.
///
/// Registration is idempotent on the FT side (keyed by the transformation GUID).
/// Every failure mode is swallowed with a log line: without the injection the
/// overlay just never loads, Jellyfin is otherwise unaffected.
/// </summary>
public sealed class RegisterTransformationTask : IScheduledTask
{
    private readonly ILogger<RegisterTransformationTask> _logger;

    public RegisterTransformationTask(ILogger<RegisterTransformationTask> logger)
    {
        _logger = logger;
    }

    public string Name => "Comment Track: register web transformation";

    public string Key => "CommentTrackRegisterWebTransformation";

    public string Description =>
        "Registers the Comment Track overlay script injection with the File Transformation plugin.";

    public string Category => "Startup Services";

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
    {
        new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger }
    };

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        try
        {
            var ftAssembly = AssemblyLoadContext.All
                .SelectMany(ctx => ctx.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);

            if (ftAssembly is null)
            {
                _logger.LogWarning(
                    "File Transformation plugin not found. The Comment Track overlay will not be injected. "
                    + "Install it, or inject /CommentTrack/client/comment-track.bundle.js manually.");
                return Task.CompletedTask;
            }

            var pluginInterface = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            var register = pluginInterface?.GetMethod("RegisterTransformation");
            if (register is null)
            {
                _logger.LogWarning(
                    "FileTransformation.PluginInterface.RegisterTransformation not found (unsupported File Transformation version).");
                return Task.CompletedTask;
            }

            // FT's own JObject type - the parameter type of RegisterTransformation(JObject).
            var jObjectType = register.GetParameters()[0].ParameterType;
            var parse = jObjectType.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, new[] { typeof(string) });
            if (parse is null)
            {
                _logger.LogWarning("Could not resolve JObject.Parse on File Transformation's Newtonsoft.Json.");
                return Task.CompletedTask;
            }

            var callbackAssembly = typeof(WebTransformations).Assembly.FullName;
            var callbackClass = typeof(WebTransformations).FullName;
            var callbackMethod = nameof(WebTransformations.InjectScript);

            // Pattern kept as the literal "index.html" (not an escaped regex) to match
            // exactly what PluginPages / Jellyfin Enhanced register - FT's exact-key
            // fast path skips a pattern stored as "index\.html".
            var json = string.Format(
                CultureInfo.InvariantCulture,
                "{{\"id\":\"{0}\",\"fileNamePattern\":\"index.html\"," +
                "\"callbackAssembly\":\"{1}\",\"callbackClass\":\"{2}\",\"callbackMethod\":\"{3}\"}}",
                Plugin.Instance!.Id,
                callbackAssembly,
                callbackClass,
                callbackMethod);

            var payload = parse.Invoke(null, new object?[] { json });
            register.Invoke(null, new[] { payload });

            _logger.LogInformation("Comment Track: index.html transformation registered with File Transformation.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Comment Track: failed to register the index.html transformation: {Message}", (ex.InnerException ?? ex).Message);
        }

        return Task.CompletedTask;
    }
}
