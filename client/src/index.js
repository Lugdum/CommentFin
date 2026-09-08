/**
 * Comment Track overlay - entry point.
 *
 * Injected before </body> on every jellyfin-web page. The overlay and the
 * progress-bar markers do nothing until a video is playing and the viewer has
 * the overlay enabled. The library badges run continuously, like the compose
 * button: they only ever surface that comments exist, so there is nothing to
 * opt into. The `danmaku` library schedules each comment against the <video>
 * clock itself once it has the full list, so there is no per-tick logic here.
 */
import { getComments, getPublicConfig, isCurrentUserAdmin } from './api.js';
import { init as initSettings, load as loadSettings } from './settings.js';
import { Overlay } from './overlay.js';
import { watchPlayer } from './player.js';
import { mountSettingsPanel } from './settings-ui.js';
import { mountDrawerEntry } from './drawer.js';
import { mountComposeButton } from './compose.js';
import { mountProgressMarkers } from './markers.js';
import { mountLibraryBadges } from './library-badges.js';

const log = (...a) => console.info('[CommentTrack]', ...a);

/** jellyfin-web bootstraps ApiClient asynchronously; our <script defer> can
 * run before it's logged in. Wait so the boot-time API calls (config, prefs,
 * admin check) are actually authenticated instead of silently falling back. */
async function waitForApiClient(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.ApiClient?.getCurrentUserId?.() && window.ApiClient?.accessToken?.()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  await waitForApiClient();

  let cfg;
  try {
    cfg = await getPublicConfig();
  } catch {
    cfg = { maxCommentLength: 200, allowAllUsersToPost: true, defaults: {} };
  }
  log('booted; config =', cfg);
  await initSettings(cfg); // resolves defaults < account-synced prefs once, up front

  const isAdmin = await isCurrentUserAdmin();

  mountLibraryBadges(); // independent of playback; runs everywhere cards render

  // Current playback session: { ctx, overlay, markers, comments, teardownCompose }
  let session = null;

  async function buildOverlay() {
    if (!session) { log('buildOverlay: no active session'); return; }
    session.overlay?.destroy();
    session.overlay = null;
    session.markers?.destroy();
    session.markers = null;

    const on = loadSettings().enabled;
    log('buildOverlay: enabled =', on, 'itemId =', session.ctx.itemId);
    if (!on) return;

    if (!session.comments) {
      try {
        session.comments = await getComments(session.ctx.itemId);
        log(`loaded ${session.comments.length} comment(s)`);
      } catch (e) {
        console.warn('[CommentTrack] failed to load comments', e);
        session.comments = [];
      }
    }
    // The <video> captured at media-start can be stale (duration NaN); re-grab.
    let video = session.ctx.video;
    if (!video || Number.isNaN(video.duration)) {
      const fresh = document.querySelector('video');
      if (fresh && !Number.isNaN(fresh.duration)) { video = fresh; session.ctx.video = fresh; }
    }
    session.overlay = new Overlay(session.ctx.container, video, loadSettings(), session.comments);
    session.markers = mountProgressMarkers(session.ctx, () => session?.comments ?? []);
  }

  watchPlayer({
    async onMediaStart(ctx) {
      log('media start', ctx.itemId);
      session = { ctx, overlay: null, markers: null, comments: null, teardownCompose: null };
      await buildOverlay();
      session.teardownCompose = mountComposeButton(ctx, cfg, (dto) => {
        session?.comments?.push(dto);
        session?.overlay?.emitNow(dto);
        session?.markers?.refresh();
      });
    },

    onMediaStop() {
      log('media stop');
      session?.teardownCompose?.();
      session?.overlay?.destroy();
      session?.markers?.destroy();
      session = null;
    },

    onResize() {
      session?.overlay?.resize();
    },
  });

  // Settings entry in the in-player menu.
  //  - requestReload:   rebuild the overlay (enable/disable, style changes)
  //  - refreshComments: drop the cache and refetch (after manage edits/deletes)
  //  - currentItemId:   what's playing, so "manage" can default to this media
  //  - isAdmin:         whether the moderation scope in "manage" should show
  const accessor = () => ({
    requestReload: buildOverlay,
    refreshComments: () => { if (session) { session.comments = null; return buildOverlay(); } },
    currentItemId: session?.ctx?.itemId,
    isAdmin,
  });
  mountSettingsPanel(accessor);
  mountDrawerEntry(accessor);
}

main().catch((e) => console.error('[CommentTrack]', e));
