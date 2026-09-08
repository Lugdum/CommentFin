/**
 * Overlay settings for the current viewer. Synced per Jellyfin account, not
 * per device - resolution order (later wins), computed ONCE at boot by
 * `init()`:
 *   1. DEFAULTS below (absolute fallback, used if nothing else is reachable)
 *   2. the server's admin-configured defaults (Plugin config → GET /config)
 *   3. this account's saved settings (GET /CommentTrack/prefs) - the same on
 *      every device/browser this viewer uses
 *
 * localStorage is a fast local MIRROR of #3 for synchronous access and an
 * offline fallback if the server can't be reached at boot - it is not an
 * independent layer a device can diverge on: `save()` writes through to the
 * server so every device converges to the last change made anywhere.
 */
import { getPrefs, putPrefs } from './api.js';

const KEY = 'commentTrack.settings';

const DEFAULTS = {
  enabled: false,
  opacity: 0.9,
  speed: 1.0,                // multiplier on scroll speed
  fontSize: 24,               // px
  displayMode: 'fixed-top',   // 'scroll' | 'fixed-top' | 'fixed-bottom'
  durationSec: 5,             // how long a fixed comment stays on screen
  showAuthor: true,
  cardTheme: 'dark',          // 'dark' | 'light' - comment bubble background
  composeOffsetSec: 1,        // back-date a new comment by this many seconds,
                               // to compensate for reaction + click/shortcut time
  composeShortcutKey: 'c',    // single-key shortcut to open the compose box
};

/** danmaku mode for the chosen display style. */
export function danmakuMode(displayMode) {
  if (displayMode === 'fixed-top') return 'top';
  if (displayMode === 'fixed-bottom') return 'bottom';
  return 'rtl';
}

let cache = null;

function readLocalMirror() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function writeLocalMirror(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

/**
 * Resolves the effective settings once at boot. Call before any `load()`.
 * @param {object} [serverConfig] the object GET /CommentTrack/config resolved to
 */
export async function init(serverConfig) {
  const base = { ...DEFAULTS, ...(serverConfig?.defaults || {}) };
  let account = null;
  let reachedServer = false;
  try {
    account = await getPrefs(); // null on 204 (no saved prefs), object on 200
    reachedServer = true;
  } catch (e) {
    console.warn('[CommentTrack] could not reach account settings, using local/offline copy', e);
  }
  // When the server answers, it is authoritative - even an empty answer means
  // "follow the admin defaults" and any stale local mirror is discarded (this
  // is what makes the dashboard's "apply to all users" reset actually land).
  // Only when the server is unreachable do we fall back to the local mirror.
  cache = reachedServer ? { ...base, ...(account || {}) } : { ...base, ...readLocalMirror() };
  writeLocalMirror(cache);
  return cache;
}

/** Synchronous getter - safe to call anywhere after `init()` has resolved. */
export function load() {
  return cache ?? { ...DEFAULTS };
}

/** Merges `patch` in, mirrors locally, and syncs just that patch to the
 * account (fire-and-forget) - the server merges it server-side, so a field
 * neither this nor any other device has touched keeps tracking the admin
 * default instead of being pinned to today's resolved value. */
export function save(patch) {
  cache = { ...load(), ...patch };
  writeLocalMirror(cache);
  putPrefs(patch).catch((e) => console.warn('[CommentTrack] failed to sync settings', e));
  return cache;
}
