/**
 * Comment Track settings panel.
 *
 * Opened from two places: the in-player settings action-sheet (the gear shown
 * during playback) and the left navigation drawer entry (see drawer.js). The
 * panel itself is the same slide-in either way.
 *
 * Selectors for the player action-sheet are jellyfin-web internals - validate on
 * 10.11.x. All lookups are defensive.
 */
import { load, save } from './settings.js';
import { openManageModal } from './manage.js';
import { t } from './i18n.js';
import { debounce } from './util.js';

const ITEM_ID = 'comment-track-settings';
const STYLE_ID = 'comment-track-style';
const ACTIONSHEET_MARKERS = ['playbackrate', 'aspectratio', 'quality', 'subtitles'];

let injected = false;

export function mountSettingsPanel(getOverlay) {
  if (injected) return;
  injected = true;
  ensureStyle();

  // subtree:true on <body> fires on every DOM mutation anywhere in the app -
  // debounced so a burst of unrelated renders collapses into one cheap check,
  // short enough (80ms) that the menu entry still feels instant when the
  // action-sheet actually opens.
  const obs = new MutationObserver(debounce(() => {
    document.querySelectorAll('.actionSheet').forEach((sheet) => {
      const scroller = sheet.querySelector('.actionSheetScroller');
      if (!scroller || scroller.querySelector(`[data-id="${ITEM_ID}"]`)) return;
      const looksLikePlayerMenu = ACTIONSHEET_MARKERS.some(
        (id) => scroller.querySelector(`[data-id="${id}"]`),
      );
      if (!looksLikePlayerMenu) return;
      addMenuEntry(scroller, () => {
        closeActionSheet(sheet);
        openSettingsPanel(getOverlay);
      });
    });
  }, 80));
  obs.observe(document.body, { childList: true, subtree: true });
}

function addMenuEntry(scroller, onClick) {
  const btn = document.createElement('button');
  btn.setAttribute('is', 'emby-button');
  btn.type = 'button';
  btn.className = 'listItem listItem-button actionSheetMenuItem emby-button';
  btn.dataset.id = ITEM_ID;
  btn.innerHTML =
    '<span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons chat" aria-hidden="true"></span>' +
    `<div class="listItemBody actionsheetListItemBody"><div class="listItemBodyText actionSheetItemText">${t('nav.comments')}</div></div>`;
  btn.addEventListener('click', onClick);
  const anchor = scroller.querySelector('[data-id="stats"]') || scroller.querySelector('[data-id="repeatmode"]');
  if (anchor) scroller.insertBefore(btn, anchor);
  else scroller.appendChild(btn);
}

function closeActionSheet(sheet) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  sheet.dispatchEvent(new Event('close'));
}

const fmt = {
  opacity: (v) => `${Math.round(v * 100)} %`,
  speed: (v) => `${v.toFixed(1)}×`,
  fontSize: (v) => `${Math.round(v)} px`,
  durationSec: (v) => `${Math.round(v)} s`,
  composeOffsetSec: (v) => `${v.toFixed(1)} s`,
};

const rowLabel = {
  durationSec: 'settings.duration',
  speed: 'settings.speed',
  fontSize: 'settings.fontSize',
  opacity: 'settings.opacity',
  composeOffsetSec: 'settings.composeOffset',
};

const displayKey = (k) => (k || 'c').toUpperCase();

export function openSettingsPanel(getOverlay) {
  closePanel();
  const s = load();

  const backdrop = document.createElement('div');
  backdrop.className = 'dialogBackdrop dialogBackdropOpened comment-track-backdrop';
  backdrop.addEventListener('click', closePanel);

  const panel = document.createElement('div');
  panel.className = 'comment-track-panel';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const slider = (k, min, max, step) =>
    `<label class="ct-row" data-row="${k}"><span>${t(rowLabel[k])}</span>
       <span class="ct-field">
         <input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" value="${s[k]}">
         <output class="ct-val" data-val="${k}">${fmt[k](s[k])}</output>
       </span></label>`;

  panel.innerHTML = `
    <h3>${t('nav.comments')}</h3>

    <label class="ct-row"><span>${t('settings.enableOverlay')}</span>
      <input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}></label>

    <label class="ct-row"><span>${t('settings.displayMode')}</span>
      <select data-k="displayMode">
        <option value="scroll" ${s.displayMode === 'scroll' ? 'selected' : ''}>${t('settings.modeScroll')}</option>
        <option value="fixed-top" ${s.displayMode === 'fixed-top' ? 'selected' : ''}>${t('settings.modeFixedTop')}</option>
        <option value="fixed-bottom" ${s.displayMode === 'fixed-bottom' ? 'selected' : ''}>${t('settings.modeFixedBottom')}</option>
      </select></label>

    ${slider('durationSec', 2, 15, 1)}
    ${slider('speed', 0.5, 2, 0.1)}
    ${slider('fontSize', 14, 42, 1)}
    ${slider('opacity', 0.1, 1, 0.05)}

    <label class="ct-row"><span>${t('settings.showAuthor')}</span>
      <input type="checkbox" data-k="showAuthor" ${s.showAuthor ? 'checked' : ''}></label>

    <label class="ct-row"><span>${t('settings.cardTheme')}</span>
      <select data-k="cardTheme">
        <option value="dark" ${s.cardTheme === 'dark' ? 'selected' : ''}>${t('settings.cardThemeDark')}</option>
        <option value="light" ${s.cardTheme === 'light' ? 'selected' : ''}>${t('settings.cardThemeLight')}</option>
      </select></label>

    ${slider('composeOffsetSec', 0, 5, 0.5)}
    <label class="ct-row"><span>${t('settings.composeShortcut')}</span>
      <button type="button" class="ct-shortcut-btn">${displayKey(s.composeShortcutKey)}</button></label>

    <div class="ct-buttons">
      <button type="button" class="ct-btn ct-manage">${t('settings.manage')}</button>
      <button type="button" class="ct-btn ct-btn-primary ct-close">${t('common.close')}</button>
    </div>
  `;

  const syncConditionalRows = () => {
    const mode = panel.querySelector('[data-k="displayMode"]').value;
    const fixed = mode === 'fixed-top' || mode === 'fixed-bottom';
    panel.querySelector('[data-row="durationSec"]').hidden = !fixed;
    panel.querySelector('[data-row="speed"]').hidden = fixed;
  };
  syncConditionalRows();

  const fieldValue = (el) => {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range') return parseFloat(el.value);
    return el.value;
  };
  // Each field saves only itself, so untouched fields keep tracking the admin
  // default (or, once this account has any saved prefs, whatever's synced
  // from another device) - see settings.js.
  panel.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('change', () => {
      save({ [el.dataset.k]: fieldValue(el) });
      syncConditionalRows();
      getOverlay?.()?.requestReload?.();
    });
  });

  // live value labels while dragging; the 'change' listener above persists on release
  panel.querySelectorAll('input[type="range"]').forEach((el) => {
    el.addEventListener('input', () => {
      const out = panel.querySelector(`[data-val="${el.dataset.k}"]`);
      if (out) out.textContent = fmt[el.dataset.k](parseFloat(el.value));
    });
  });

  panel.querySelector('.ct-shortcut-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.textContent = '…';
    btn.classList.add('recording');
    const capture = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      document.removeEventListener('keydown', capture, true);
      btn.classList.remove('recording');
      // Only accept a single printable character (Escape cancels unchanged).
      if (ev.key !== 'Escape' && ev.key.length === 1) {
        save({ composeShortcutKey: ev.key.toLowerCase() });
      }
      btn.textContent = displayKey(load().composeShortcutKey);
    };
    document.addEventListener('keydown', capture, true);
  });

  panel.querySelector('.ct-close').addEventListener('click', closePanel);
  panel.querySelector('.ct-manage').addEventListener('click', () => {
    const o = getOverlay?.();
    openManageModal({
      currentItemId: o?.currentItemId,
      isAdmin: !!o?.isAdmin,
      onChanged: (changedItemId) => {
        const cur = getOverlay?.();
        if (!changedItemId || changedItemId === cur?.currentItemId) cur?.refreshComments?.();
      },
    });
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('open'));

  const onKey = (e) => { if (e.key === 'Escape') closePanel(); };
  document.addEventListener('keydown', onKey);
  closePanel._cleanup = () => document.removeEventListener('keydown', onKey);
}

function closePanel() {
  closePanel._cleanup?.();
  closePanel._cleanup = null;
  document.querySelectorAll('.comment-track-panel, .comment-track-backdrop').forEach((n) => n.remove());
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
  .comment-track-backdrop { z-index: 1000000; }
  .comment-track-panel {
    position: fixed; top: 0; right: 0; height: 100vh; width: min(420px, 92vw);
    z-index: 1000001; background: #101010; color: #fff; padding: 1.4em 1.6em;
    box-shadow: -4px 0 24px rgba(0,0,0,.5); overflow-y: auto;
    transform: translateX(100%); transition: transform .18s ease-out; font-size: 1rem;
  }
  .comment-track-panel.open { transform: translateX(0); }
  .comment-track-panel h3 { margin: 0 0 1.1em; font-weight: 600; }
  .comment-track-panel .ct-row {
    display: flex; align-items: center; justify-content: space-between; gap: 1em; margin: 1em 0;
  }
  .comment-track-panel .ct-row[hidden] { display: none; }
  .comment-track-panel .ct-field { display: flex; align-items: center; gap: .7em; flex: 1; max-width: 60%; justify-content: flex-end; }
  .comment-track-panel .ct-field input[type="range"] { flex: 1; }
  .comment-track-panel .ct-val { min-width: 3.4em; text-align: right; color: #9aa; font-variant-numeric: tabular-nums; }
  .comment-track-panel select { background: #1c1c1c; color: #fff; border: 1px solid #444; border-radius: 5px; padding: .35em .5em; }
  .comment-track-panel .ct-shortcut-btn {
    min-width: 2.6em; padding: .3em .6em; background: #1c1c1c; border: 1px solid #444;
    color: #fff; border-radius: 5px; cursor: pointer; font-variant-numeric: tabular-nums;
  }
  .comment-track-panel .ct-shortcut-btn.recording { border-color: #00a4dc; color: #00a4dc; }
  .comment-track-panel .ct-buttons { margin-top: 1.8em; display: flex; flex-direction: column; gap: .6em; }
  .comment-track-panel .ct-btn {
    width: 100%; padding: .7em; border-radius: 6px; cursor: pointer; font-size: .95rem;
    background: #1f1f1f; border: 1px solid #383838; color: #e6e6e6;
  }
  .comment-track-panel .ct-btn:hover { background: #262626; }
  .comment-track-panel .ct-btn-primary { background: #00a4dc; border-color: #00a4dc; color: #fff; }
  .comment-track-panel .ct-btn-primary:hover { background: #0bb4ec; }
  `;
  document.head.appendChild(st);
}
