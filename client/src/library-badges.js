/**
 * A small "N comments" badge on library card thumbnails, so browsing shows at
 * a glance where people have been commenting.
 *
 * Cards render continuously as the user scrolls/navigates. A debounced
 * whole-page MutationObserver picks up new `.card[data-id]` elements, their
 * ids are batched, and the server is asked for counts only for that batch -
 * never the whole comment database, never one request per card.
 */
import { getCommentCounts } from './api.js';
import { debounce } from './util.js';

const BATCH_CAP = 200;
const norm = (id) => String(id).replace(/-/g, '').toLowerCase();
const countCache = new Map(); // norm(id) -> count (0 included), session-lived

export function mountLibraryBadges() {
  ensureStyle();
  const pending = new Set();

  const flush = debounce(async () => {
    const ids = [...pending].slice(0, BATCH_CAP);
    pending.clear();
    if (!ids.length) return;
    let counts;
    try {
      counts = await getCommentCounts(ids);
    } catch (e) {
      console.warn('[CommentTrack] badges: count fetch failed', e);
      return;
    }
    const byNorm = {};
    for (const [k, v] of Object.entries(counts)) byNorm[norm(k)] = v;
    for (const id of ids) {
      const n = byNorm[norm(id)] ?? 0;
      countCache.set(norm(id), n);
    }
    applyAll();
  }, 400);

  const scan = debounce(() => {
    const cards = document.querySelectorAll('.card[data-id]');
    let unknown = 0;
    cards.forEach((card) => {
      const id = card.dataset.id;
      if (!id) return;
      if (countCache.has(norm(id))) {
        if (!card.querySelector('.ct-card-badge')) applyBadgeTo(card, countCache.get(norm(id)));
      } else {
        pending.add(id);
        unknown++;
      }
    });
    if (unknown) flush();
  }, 300);

  scan();
  const obs = new MutationObserver(scan);
  obs.observe(document.body, { childList: true, subtree: true });
  return () => obs.disconnect();
}

function applyAll() {
  document.querySelectorAll('.card[data-id]').forEach((card) => {
    const id = card.dataset.id;
    if (id && countCache.has(norm(id)) && !card.querySelector('.ct-card-badge')) {
      applyBadgeTo(card, countCache.get(norm(id)));
    }
  });
}

function applyBadgeTo(card, count) {
  if (!count) return;
  if (card.querySelector('.ct-card-badge')) return;
  const host = card.querySelector('.cardImageContainer') || card.querySelector('.cardBox') || card;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const badge = document.createElement('div');
  badge.className = 'ct-card-badge';
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.title = count === 1 ? '1 comment' : `${count} comments`;
  host.appendChild(badge);
}

function ensureStyle() {
  if (document.getElementById('comment-track-badge-style')) return;
  const st = document.createElement('style');
  st.id = 'comment-track-badge-style';
  st.textContent = `
  .ct-card-badge {
    position: absolute; top: .35em; right: .35em; z-index: 2;
    background: rgba(0,164,220,.92); color: #fff; font-size: .72rem; font-weight: 700;
    line-height: 1; padding: .3em .45em; border-radius: 999px;
    box-shadow: 0 1px 4px rgba(0,0,0,.5); pointer-events: none;
    display: flex; align-items: center; gap: .25em;
  }
  .ct-card-badge::before { content: "💬"; font-size: .85em; }
  `;
  document.head.appendChild(st);
}
