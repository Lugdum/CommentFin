/**
 * Danmaku overlay wrapper.
 *
 * The `danmaku` library does the timecode scheduling itself: give it the full
 * comment list with a `time` (seconds) field bound to the <video>; it emits
 * each comment when playback reaches that time and handles pause / rate /
 * seeking (including backward re-play) internally. We only build it, resize
 * it, and `emit()` a comment the local viewer just posted.
 *
 * DOM engine (not canvas) so comments are real nodes - needed for both the
 * CSS fade-out and the rich comment-bubble markup (avatar + name + text)
 * built by `render()` below; the library measures the real rendered node for
 * layout, so a custom `render()` is a first-class option, not a workaround.
 *
 * danmaku uses ONE global on-screen lifetime: `duration = stageWidth / speed`
 * seconds, applied to scrolling AND fixed (top/bottom) comments. So for the
 * fixed modes we derive `speed` from the wanted seconds; for scroll we use the
 * speed multiplier directly.
 */
import Danmaku from 'danmaku';
import { danmakuMode } from './settings.js';
import { avatarUrl } from './api.js';

const log = (...a) => console.info('[CommentTrack]', ...a);
const FADE_MS = 900;           // tail of a fixed comment's life spent fading out
const SCROLL_BASE_SPEED = 144;  // px/s at multiplier 1

function ensureStyle() {
  if (document.getElementById('comment-track-overlay-style')) return;
  const st = document.createElement('style');
  st.id = 'comment-track-overlay-style';
  st.textContent = `
  @keyframes ct-fade-out { from { opacity: 1 } to { opacity: 0 } }
  .ct-card {
    display: flex; align-items: center; gap: .6em;
    border-radius: 16px; padding: .35em .9em .35em .5em;
    box-shadow: 0 2px 10px rgba(0,0,0,.35);
    max-width: min(70vw, 480px); box-sizing: border-box; width: max-content;
  }
  .ct-card-light { background: #ffffff; }
  .ct-card-light .ct-card-text { color: #17171a; }
  .ct-card-light .ct-card-name { color: #86868b; }
  .ct-card-dark { background: rgba(58, 58, 60, .92); border: 1px solid rgba(255,255,255,.08); }
  .ct-card-dark .ct-card-text { color: #f5f5f7; }
  .ct-card-dark .ct-card-name { color: #aeaeb2; }
  .ct-card-left { display: flex; flex-direction: column; align-items: center; gap: .15em; flex-shrink: 0; }
  .ct-card-avatar { border-radius: 50%; object-fit: cover; display: block; }
  .ct-card-avatar-fallback { display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; }
  .ct-card-name { max-width: 4.4em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-card-text { font-weight: 600; line-height: 1.25; white-space: pre-wrap; overflow-wrap: anywhere; }
  `;
  document.head.appendChild(st);
}

/** Deterministic colour per name, so fallback avatars stay visually distinct. */
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 45%, 38%)`;
}

function buildAvatar(userId, userName, sizePx) {
  const fallback = () => {
    const el = document.createElement('div');
    el.className = 'ct-card-avatar ct-card-avatar-fallback';
    el.style.width = el.style.height = `${sizePx}px`;
    el.style.fontSize = `${Math.round(sizePx * 0.48)}px`;
    el.style.background = colorForName(userName || '?');
    el.textContent = (userName || '?').trim().charAt(0).toUpperCase();
    return el;
  };
  if (!userId) return fallback();

  const img = document.createElement('img');
  img.className = 'ct-card-avatar';
  img.style.width = img.style.height = `${sizePx}px`;
  img.alt = '';
  img.loading = 'lazy';
  img.src = avatarUrl(userId, sizePx * 2); // 2x for HiDPI
  img.onerror = () => img.replaceWith(fallback());
  return img;
}

/** Builds the comment bubble node danmaku positions/animates for us. */
function buildCardNode(c, settings, fixed) {
  const userId = c.userId ?? c.UserId;
  const userName = c.userName ?? c.UserName ?? '';
  const body = c.body ?? c.Body ?? '';
  const fontSize = settings.fontSize ?? 24;

  const root = document.createElement('div');
  root.className = `ct-card ${settings.cardTheme === 'light' ? 'ct-card-light' : 'ct-card-dark'}`;

  const left = document.createElement('div');
  left.className = 'ct-card-left';
  const avatarSize = Math.round(fontSize * 1.5);
  left.appendChild(buildAvatar(userId, userName, avatarSize));
  if (settings.showAuthor && userName) {
    const name = document.createElement('div');
    name.className = 'ct-card-name';
    name.style.fontSize = `${Math.round(fontSize * 0.46)}px`;
    name.textContent = userName;
    left.appendChild(name);
  }

  const text = document.createElement('div');
  text.className = 'ct-card-text';
  text.style.fontSize = `${fontSize}px`;
  text.textContent = body;

  root.appendChild(left);
  root.appendChild(text);

  if (fixed) {
    const durMs = Math.max(1500, (settings.durationSec ?? 5) * 1000);
    root.style.animation = `ct-fade-out ${FADE_MS}ms linear ${durMs - FADE_MS}ms forwards`;
  }
  return root;
}

function toDanmakuComment(c, settings, fixed) {
  const posMs = c.positionMs ?? c.PositionMs ?? 0;
  return {
    time: posMs / 1000,
    mode: danmakuMode(settings.displayMode),
    render: () => buildCardNode(c, settings, fixed),
  };
}

export class Overlay {
  /** @param {HTMLElement} playerContainer  @param {HTMLVideoElement} video */
  constructor(playerContainer, video, settings, comments) {
    this.settings = settings;
    this.video = video;
    ensureStyle();

    const mode = danmakuMode(settings.displayMode);
    this.fixed = mode === 'top' || mode === 'bottom';

    this.node = document.createElement('div');
    this.node.className = 'comment-track-overlay';
    Object.assign(this.node.style, {
      position: 'fixed',
      left: '0',
      top: '3%', // small gap so top-anchored/scrolling comments aren't flush against the screen edge
      width: '100%',
      height: '87%', // same bottom boundary as before (3% + 87% = 90%), clear of subtitles / OSD
      pointerEvents: 'none',
      opacity: String(settings.opacity ?? 0.9),
      zIndex: '2000', // above the <video> and OSD; clicks pass through
    });
    (document.getElementById('reactRoot') || playerContainer).appendChild(this.node);

    const stageWidth = this.node.clientWidth || window.innerWidth || 1280;
    const speed = this.fixed
      ? Math.max(20, Math.round(stageWidth / Math.max(1.5, settings.durationSec ?? 5)))
      : SCROLL_BASE_SPEED * (settings.speed ?? 1);

    const mapped = (comments ?? []).map((c) => toDanmakuComment(c, settings, this.fixed));

    this.danmaku = new Danmaku({
      container: this.node,
      media: video,
      engine: 'dom',
      comments: mapped,
      speed,
    });
    this.danmaku.show();
    log(`overlay ready (${mapped.length} comment(s), mode=${settings.displayMode})`);
  }

  /** A comment the local viewer just posted - show it now. */
  emitNow(comment) {
    this.danmaku?.emit(toDanmakuComment(comment, this.settings, this.fixed));
  }

  resize() { this.danmaku?.resize(); }
  show() { this.danmaku?.show(); }
  hide() { this.danmaku?.hide(); }

  destroy() {
    try { this.danmaku?.clear(); this.danmaku?.destroy(); } catch { /* ignore */ }
    this.danmaku = null;
    this.node?.remove();
  }
}
