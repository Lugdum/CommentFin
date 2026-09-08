using System;
using System.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.CommentTrack.Api;

/// <summary>Serves the embedded browser bundle. Anonymous: it loads on every
/// page, including the login screen, before a token exists.</summary>
[ApiController]
[AllowAnonymous]
[Route("CommentTrack/client")]
public class AssetController : ControllerBase
{
    private const string ResourceName = "Jellyfin.Plugin.CommentTrack.Resources.comment-track.bundle.js";

    /// <summary>Gets the overlay bundle.</summary>
    [HttpGet("comment-track.bundle.js")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetBundle()
    {
        var stream = typeof(AssetController).Assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            return NotFound();
        }

        // Bundle name is content-hashed by CI in real releases; a short cache is safe here.
        Response.Headers[HeaderNames.CacheControl] = "public, max-age=300";
        return File(stream, "application/javascript; charset=utf-8");
    }
}
