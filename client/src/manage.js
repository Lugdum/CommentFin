/**
 * "Manage my comments" modal, reached from the settings panel. It has three
 * scopes: the media currently playing, everything the viewer has ever posted,
 * and (admins only) every comment on the server for moderation. Each row can be
 * edited or deleted inline. The moderation scope is delete-only and never
 * rewrites someone else's text. The server would allow an admin to edit any
 * comment, but moderation here is only meant for taking things down.
 */
import { getComments, getMyComments, getAllComments, updateComment, deleteComment } from './api.js';
import { guardInput } from './keyguard.js';
import { t } from './i18n.js';

const STYLE_ID = 'comment-track-manage-style';

function fmtTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function openManageModal({ currentItemId, onChanged, isAdmin } = {}) {
  ensureStyle();
  close();

  let scope = currentItemId ? 'item' : 'all';
  let pendingUnguard = null; // teardown for an in-progress row edit's keyguard

  const backdrop = document.createElement('div');
  backdrop.className = 'dialogBackdrop dialogBackdropOpened comment-track-manage-backdrop';
  backdrop.addEventListener('click', close);

  const modal = document.createElement('div');
  modal.className = 'comment-track-manage';
  modal.addEventListener('click', (e) => e.stopPropagation());
  modal.innerHTML = `
    <div class="ctm-head">
      <h3>${t('manage.title')}</h3>
      <button type="button" class="ctm-x" aria-label="${t('common.close')}">✕</button>
    </div>
    <div class="ctm-scope">
      ${currentItemId ? `<button type="button" data-scope="item">${t('manage.scopeItem')}</button>` : ''}
      <button type="button" data-scope="all">${t('manage.scopeAll')}</button>
      ${isAdmin ? `<button type="button" data-scope="admin">${t('manage.scopeAdmin')}</button>` : ''}
    </div>
    <div class="ctm-list">${t('manage.loading')}</div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const listEl = modal.querySelector('.ctm-list');
  modal.querySelector('.ctm-x').addEventListener('click', close);
  modal.querySelectorAll('[data-scope]').forEach((b) => {
    b.addEventListener('click', () => { scope = b.dataset.scope; syncScopeButtons(); render(); });
  });

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  close._cleanup = () => {
    document.removeEventListener('keydown', onKey);
    pendingUnguard?.();
  };

  function syncScopeButtons() {
    modal.querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('active', b.dataset.scope === scope));
  }

  async function render() {
    pendingUnguard?.();
    pendingUnguard = null;
    syncScopeButtons();
    listEl.textContent = t('manage.loading');
    let rows;
    try {
      rows = scope === 'item' ? (await getComments(currentItemId)).filter((c) => c.mine)
        : scope === 'admin' ? await getAllComments()
        : await getMyComments();
    } catch (e) {
      console.warn('[CommentTrack] manage: failed to load', e);
      listEl.textContent = t('manage.loadError');
      return;
    }
    if (!rows.length) {
      listEl.textContent = scope === 'item' ? t('manage.emptyItem')
        : scope === 'admin' ? t('manage.emptyAdmin')
        : t('manage.emptyAll');
      return;
    }
    listEl.innerHTML = '';
    for (const c of rows) listEl.appendChild(rowNode(c));
  }

  function rowNode(c) {
    const row = document.createElement('div');
    row.className = 'ctm-row';
    const meta = scope === 'admin'
      ? [c.itemName, c.userName, fmtTime(c.positionMs)].filter(Boolean).join(' · ')
      : scope === 'all' && c.itemName ? `${c.itemName} · ${fmtTime(c.positionMs)}`
      : fmtTime(c.positionMs);
    // The moderation scope is delete-only. It never rewrites someone else's
    // words, even though the server would technically allow an admin to.
    const canEdit = c.mine;
    row.innerHTML = `
      <div class="ctm-meta">${escapeHtml(meta)}</div>
      <div class="ctm-body">${escapeHtml(c.body)}</div>
      <div class="ctm-actions">
        ${canEdit ? `<button type="button" class="ctm-edit" title="${t('manage.edit')}">✏️</button>` : ''}
        <button type="button" class="ctm-del" title="${t('manage.delete')}">🗑️</button>
      </div>
    `;
    if (canEdit) row.querySelector('.ctm-edit').addEventListener('click', () => beginEdit(row, c));
    row.querySelector('.ctm-del').addEventListener('click', () => beginDelete(row, c));
    return row;
  }

  function beginEdit(row, c) {
    const bodyEl = row.querySelector('.ctm-body');
    bodyEl.innerHTML = `<input class="ctm-input" type="text" value="${escapeHtml(c.body)}">
      <button type="button" class="ctm-save">OK</button>
      <button type="button" class="ctm-cancel">${t('common.cancel')}</button>`;
    const input = bodyEl.querySelector('.ctm-input');
    input.focus();
    input.select();
    // render() tears down pendingUnguard for us; see its top.
    const done = () => render();
    const save = async () => {
      const v = input.value.trim();
      if (!v || v === c.body) return done();
      try {
        await updateComment(c.id, v);
        onChanged?.(c.itemId);
        done();
      } catch (e) {
        console.warn('[CommentTrack] manage: edit failed', e);
        input.style.outline = '2px solid #ff8a80';
      }
    };
    bodyEl.querySelector('.ctm-cancel').addEventListener('click', done);
    bodyEl.querySelector('.ctm-save').addEventListener('click', save);
    // Contains keystrokes so page hotkeys don't fire while editing; see keyguard.js.
    pendingUnguard = guardInput(input, { onEnter: save, onEscape: done });
  }

  function beginDelete(row, c) {
    const actions = row.querySelector('.ctm-actions');
    actions.innerHTML = `<span class="ctm-confirm">${t('manage.confirmDelete')}</span>
      <button type="button" class="ctm-yes">${t('common.yes')}</button>
      <button type="button" class="ctm-no">${t('common.no')}</button>`;
    actions.querySelector('.ctm-no').addEventListener('click', () => render());
    actions.querySelector('.ctm-yes').addEventListener('click', async () => {
      try {
        await deleteComment(c.id);
        onChanged?.(c.itemId);
      } catch (e) {
        console.warn('[CommentTrack] manage: delete failed', e);
      }
      render();
    });
  }

  render();
}

function close() {
  close._cleanup?.();
  close._cleanup = null;
  document.querySelectorAll('.comment-track-manage, .comment-track-manage-backdrop').forEach((n) => n.remove());
}

/** Escapes text for both HTML content and (quoted) attribute contexts. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
  .comment-track-manage-backdrop { z-index: 1000010; }
  .comment-track-manage {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -48%);
    z-index: 1000011; width: min(680px, 94vw); max-height: 82vh; display: flex; flex-direction: column;
    background: #101010; color: #fff; border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.6);
    opacity: 0; transition: opacity .15s, transform .15s;
  }
  .comment-track-manage.open { opacity: 1; transform: translate(-50%, -50%); }
  .comment-track-manage .ctm-head { display: flex; align-items: center; justify-content: space-between; padding: 1em 1.2em; border-bottom: 1px solid #262626; }
  .comment-track-manage h3 { margin: 0; font-weight: 600; }
  .comment-track-manage .ctm-x { background: none; border: 0; color: #aaa; font-size: 1.1rem; cursor: pointer; }
  .comment-track-manage .ctm-scope { display: flex; gap: .5em; padding: .8em 1.2em; }
  .comment-track-manage .ctm-scope button { background: #1f1f1f; border: 1px solid #333; color: #ccc; padding: .35em .9em; border-radius: 999px; cursor: pointer; font-size: .9rem; }
  .comment-track-manage .ctm-scope button.active { background: #00a4dc; border-color: #00a4dc; color: #fff; }
  .comment-track-manage .ctm-list { overflow-y: auto; padding: 0 1.2em 1.2em; }
  .comment-track-manage .ctm-row { display: grid; grid-template-columns: 1fr auto; gap: .2em 1em; padding: .7em 0; border-bottom: 1px solid #1e1e1e; align-items: start; }
  .comment-track-manage .ctm-meta { grid-column: 1 / -1; font-size: .8rem; color: #8a8a8a; }
  .comment-track-manage .ctm-body { font-size: .98rem; word-break: break-word; }
  .comment-track-manage .ctm-actions { display: flex; gap: .4em; align-items: center; white-space: nowrap; }
  .comment-track-manage .ctm-actions button { background: #1f1f1f; border: 1px solid #333; color: #ddd; border-radius: 6px; padding: .2em .5em; cursor: pointer; }
  .comment-track-manage .ctm-input { width: 100%; padding: .4em .6em; background: #1c1c1c; border: 1px solid #444; color: #fff; border-radius: 5px; }
  .comment-track-manage .ctm-body button { margin-left: .4em; background: #1f1f1f; border: 1px solid #333; color: #ddd; border-radius: 5px; padding: .25em .6em; cursor: pointer; }
  .comment-track-manage .ctm-confirm { color: #ff8a80; font-size: .85rem; }
  `;
  document.head.appendChild(st);
}
