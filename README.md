# CommentFin

CommentFin lets the people you share your Jellyfin server with leave comments
that are pinned to a moment in a movie or episode. The next time someone else
watches that title, the comments scroll or pop up over the video at the timecode
they were written for, a bit like the danmaku overlays on some video sites.

Nobody has to be watching at the same time. You can drop a comment on episode 3
today and a friend will see it when they get there next week. It is a small,
lighthearted feature meant for a server shared with friends or family, and it
only runs in the web client (browser or installed PWA). The overlay is off until
each viewer turns it on for themselves.

> [!WARNING]
> This plugin was built in a pair-programming session with an AI assistant
> (Claude). It runs well on the author's server, but it leans heavily on the
> internal structure of Jellyfin's web client, so expect the occasional rough
> edge and expect small things to break when Jellyfin ships a web update.
> Issues and pull requests are welcome.

## Features

* **The comment overlay.** Comments can scroll across the video, sit fixed at
  the top, or sit fixed at the bottom and fade out. Each one is a small card
  with the author's avatar and name.
* **Writing a comment while you watch.** There is a button in the video controls
  and a configurable single-key shortcut (default `C`). It pauses playback,
  takes the current timecode (backdated by a small, configurable amount so the
  comment lands where you reacted rather than where you finished typing), posts
  what you wrote, shows it straight away, and resumes.
* **Progress-bar markers.** Every comment gets a dot on the scrubber. Click a
  dot to jump to that moment.
* **Library badges.** A thumbnail that has comments shows a small count with a
  speech-bubble icon while you browse.
* **Per-account settings.** Opacity, speed, text size, style and so on are saved
  to your Jellyfin account and follow you to every device and browser you sign
  in on, rather than being stored per device.
* **Admin defaults.** The plugin config page sets the starting value for every
  setting, and a button re-applies those defaults to everyone who already has an
  account.
* **Per-user access.** From the same config page you can search your users and,
  for any one of them, turn the overlay on or off (they can still change it back
  themselves) or block the plugin for them entirely. A blocked user gets no
  overlay, compose button or badges, and the server stops accepting comments
  from them; the comments they already posted stay visible.
* **Managing and moderating.** Each viewer can edit or delete their own
  comments, either for the title they are watching or across everything they
  have ever posted. Administrators also get an "Everyone" view for taking down
  any comment on the server.
* **Languages.** English and French are included. Adding another language is one
  object in `client/src/i18n.js`.

A few things are deliberately left out for now, so open an issue if you would
like to help build one of them: reporting or flagging a comment, blocking a
specific user, and friends-only visibility.

## Requirements

* Jellyfin **10.11** (built and tested against 10.11.x, with `targetAbi`
  `10.11.0.0`).
* The [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
  plugin, which CommentFin uses to inject its browser script. The server side
  still works without it, but you would then have to load
  `/CommentTrack/client/comment-track.bundle.js` some other way, for example
  with the [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector)
  plugin.

## Installing

The easiest way is through the plugin repository. In Jellyfin, go to
**Dashboard → Plugins → Repositories**, add a repository, and paste this URL:

```
https://raw.githubusercontent.com/Lugdum/CommentFin/main/manifest.json
```

Then open **Catalog → CommentFin → Install** and restart Jellyfin. From then on,
updates show up in the catalog like any other plugin. You can set the defaults
under **Dashboard → Plugins → CommentFin**.

If you would rather install a release by hand, download the zip from the
[Releases](https://github.com/Lugdum/CommentFin/releases) page, unzip it into
`<jellyfin config>/plugins/CommentFin_<version>/` so that the `.dll` sits at the
root of that folder, and restart.

To build it yourself you do not need the .NET SDK or Node on the host, because
everything runs in throwaway containers:

```sh
./build/build.sh   # produces dist/commentfin_<version>.zip and dist/publish/*.dll
```

The GitHub Actions workflow runs the same script and uploads the result.

## How it works

| Path | What it holds |
|---|---|
| `src/Jellyfin.Plugin.CommentTrack/` | The C# server plugin (net9.0). It serves a REST API under `/CommentTrack`, keeps a small SQLite database next to Jellyfin's own data directory, and registers with File Transformation to inject the browser script. The internal name is still "Comment Track"; only the display name is "CommentFin". |
| `client/` | The browser overlay. Plain JavaScript, bundled by esbuild into a single file that is embedded in the plugin `.dll` and served from it. |
| `build/`, `.github/workflows/` | The container-based build and the CI and release workflows. |

There is no extra service to run and no reverse-proxy configuration. The API
lives inside the Jellyfin process, authentication is Jellyfin's own, and all
storage is one SQLite file.

## Credits

* Comment rendering uses [`danmaku`](https://github.com/weizhenye/Danmaku) by
  weizhenye (MIT), bundled into the overlay.
* The approach for hooking into the web player is adapted from
  [jellyfin-danmaku](https://github.com/Izumiko/jellyfin-danmaku) by Izumiko (MIT).
* Built with help from Claude (Anthropic).

## License

MIT. See [LICENSE](LICENSE).
