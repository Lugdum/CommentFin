/**
 * In-player comment authoring: a button in the OSD control bar (and a
 * configurable single-key shortcut) that opens a compose box. On send the
 * comment is POSTed and shown immediately, then playback resumes.
 *
 * OSD selectors are jellyfin-web internals - validate on 10.11.x. The button is
 * re-inserted on an interval because jellyfin-web rebuilds the OSD when it
 * hides/shows.
 */
import { postComment } from './api.js';
import { load as loadSettings } from './settings.js';
import { guardInput } from './keyguard.js';
import { t } from './i18n.js';

const BTN_CLASS = 'btnCommentTrackAdd';
const BOX_ID = 'comment-track-compose';

export function mountComposeButton(ctx, publicConfig, onPosted) {
  let boxOpen = false;
  const setOpen = (v) => { boxOpen = v; };

  const tick = window.setInterval(() => ensureButton(ctx, publicConfig, onPosted, setOpen), 500);
  ensureButton(ctx, publicConfig, onPosted, setOpen);

  const onShortcut = (e) => {
    if (boxOpen || isTypingTarget(document.activeElement)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const shortcut = (loadSettings().composeShortcutKey || 'c').toLowerCase();
    if (e.key.toLowerCase() !== shortcut) return;
    e.preventDefault();
    openBox(ctx, publicConfig, onPosted, setOpen);
  };
  document.addEventListener('keydown', onShortcut);

  return () => {
    window.clearInterval(tick);
    document.removeEventListener('keydown', onShortcut);
    closeBox();
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
  };
}

function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function ensureButton(ctx, publicConfig, onPosted, setOpen) {
  const pause = firstVisible(document.querySelectorAll('.btnPause'));
  const row = pause?.parentElement;
  if (!row || row.querySelector(`.${BTN_CLASS}`)) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('is', 'paper-icon-button-light');
  btn.className = `${BTN_CLASS} autoSize paper-icon-button-light`;
  btn.title = t('compose.addTitle');
  btn.innerHTML = '<span class="material-icons add_comment" aria-hidden="true"></span>';
  btn.addEventListener('click', () => openBox(ctx, publicConfig, onPosted, setOpen));
  row.insertBefore(btn, pause.nextSibling);
}

function openBox(ctx, publicConfig, onPosted, setOpen) {
  closeBox();
  setOpen(true);
  const { video, itemId } = ctx;
  const settings = loadSettings();
  const maxLen = publicConfig?.maxCommentLength ?? 200;
  const wasPaused = video.paused;
  // Shift the recorded timecode earlier to compensate for the time it takes
  // to notice the moment and reach for the button/shortcut.
  const atMs = Math.max(0, Math.round((video.currentTime - (settings.composeOffsetSec ?? 1)) * 1000));
  video.pause();

  const box = document.createElement('div');
  box.id = BOX_ID;
  box.innerHTML = `
    <div class="ct-compose-inner">
      <span class="ct-compose-time">${formatTime(atMs)}</span>
      <input type="text" class="ct-compose-input" maxlength="${maxLen}"
             placeholder="${t('compose.placeholder')}" autocomplete="off">
      <button type="button" class="ct-compose-send raised emby-button">${t('compose.send')}</button>
      <button type="button" class="ct-compose-cancel emby-button">${t('common.cancel')}</button>
      <div class="ct-compose-error" hidden></div>
    </div>`;
  ensureStyle();
  (document.getElementById('reactRoot') || document.body).appendChild(box);

  const input = box.querySelector('.ct-compose-input');
  const errEl = box.querySelector('.ct-compose-error');
  input.focus();

  // The box only ever pauses playback to compose; every exit path resumes it
  // (unless the video was already paused before the box opened).
  const finish = () => {
    unguard();
    closeBox();
    setOpen(false);
    if (!wasPaused) video.play().catch(() => {});
  };

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    box.querySelector('.ct-compose-send').disabled = true;
    try {
      const dto = await postComment(itemId, atMs, text);
      onPosted?.(dto);
      finish();
    } catch (e) {
      errEl.textContent =
        e.status === 429 ? t('compose.errorRateLimited')
        : e.status === 403 ? t('compose.errorForbidden')
        : t('compose.errorGeneric');
      errEl.hidden = false;
      box.querySelector('.ct-compose-send').disabled = false;
    }
  };

  box.querySelector('.ct-compose-send').addEventListener('click', send);
  box.querySelector('.ct-compose-cancel').addEventListener('click', finish);
  // Contains keystrokes to this field so page hotkeys (Jellyfin's own, browser
  // extensions like Vimium) don't fire while composing - see keyguard.js.
  const unguard = guardInput(input, { onEnter: send, onEscape: finish });
}

function closeBox() {
  document.getElementById(BOX_ID)?.remove();
}

function firstVisible(nodeList) {
  for (const el of nodeList) if (el.offsetParent !== null) return el;
  return null;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function ensureStyle() {
  if (document.getElementById('comment-track-compose-style')) return;
  const st = document.createElement('style');
  st.id = 'comment-track-compose-style';
  st.textContent = `
  #${BOX_ID} {
    position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%);
    z-index: 1000002; background: rgba(16,16,16,.96); color: #fff;
    border-radius: 8px; padding: .8em 1em; box-shadow: 0 6px 30px rgba(0,0,0,.55);
    max-width: 92vw;
  }
  #${BOX_ID} .ct-compose-inner { display: flex; align-items: center; gap: .6em; flex-wrap: wrap; }
  #${BOX_ID} .ct-compose-time { font-variant-numeric: tabular-nums; opacity: .7; }
  #${BOX_ID} .ct-compose-input {
    flex: 1; min-width: 260px; padding: .5em .7em; border-radius: 5px;
    border: 1px solid #444; background: #1c1c1c; color: #fff; font-size: 1rem;
  }
  #${BOX_ID} .ct-compose-error { flex-basis: 100%; color: #ff8a80; font-size: .85rem; }
  `;
  document.head.appendChild(st);
}
