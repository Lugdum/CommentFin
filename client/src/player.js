/**
 * Jellyfin web player integration for Jellyfin 10.11.x.
 *
 * Approach and selectors adapted from jellyfin-danmaku (MIT, Izumiko).
 * jellyfin-web exposes no "player ready" event, so we piece one together:
 *  - an XHR hook captures the ItemId from the /PlaybackInfo response;
 *  - a MutationObserver on <body> tracks the player container mount/unmount;
 *  - a MutationObserver on <video> attributes catches in-place source switches.
 *
 * Public API:
 *   watchPlayer({ onMediaStart(ctx), onMediaStop(), onResize() }) -> teardown()
 *   where ctx = { video, itemId, container }
 */
import { debounce } from './util.js';

let sniffedItemId = null;
let snifferInstalled = false;

/** Install once: read ItemId from ApiClient's /PlaybackInfo XHR. */
function installItemIdSniffer() {
  if (snifferInstalled) return;
  snifferInstalled = true;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (_method, url) {
    try {
      if (typeof url === 'string' && url.split('?')[0].endsWith('/PlaybackInfo')) {
        this.addEventListener('load', function () {
          try {
            const res = JSON.parse(this.responseText);
            sniffedItemId = res?.MediaSources?.[0]?.Id ?? res?.Id ?? sniffedItemId;
          } catch { /* ignore */ }
        });
      }
    } catch { /* ignore */ }
    return open.apply(this, arguments);
  };
}

function isJellyfin() {
  return document.querySelector('meta[name="application-name"]')?.content === 'Jellyfin';
}

const visible = (el) => el && el.offsetParent !== null && !el.classList.contains('hide');

/** The live OSD container (jellyfin-web keeps hidden duplicates around). */
function findContainer() {
  const nodes = document.querySelectorAll("div[data-type='video-osd']");
  for (const el of nodes) if (!el.classList.contains('hide')) return el;
  return document.querySelector('.videoPlayerContainer') || null;
}

const findVideo = () => document.querySelector('video');

export function watchPlayer(handlers) {
  const { onMediaStart, onMediaStop, onResize } = handlers;
  if (!isJellyfin()) return () => {};
  installItemIdSniffer();

  let active = null; // { video, itemId, container }
  let attrObs = null;
  let resizeObs = null;
  let pollId = 0;

  const stop = () => {
    if (!active) return;
    attrObs?.disconnect(); attrObs = null;
    resizeObs?.disconnect(); resizeObs = null;
    active = null;
    try { onMediaStop?.(); } catch (e) { console.error('[CommentTrack]', e); }
  };

  const start = () => {
    const video = findVideo();
    const container = findContainer();
    const itemId = sniffedItemId;
    if (!video || !container || !itemId) return;
    if (active && active.video === video && active.itemId === itemId) return;
    if (active) stop();

    active = { video, itemId, container };

    // in-place source / episode switch
    attrObs = new MutationObserver(debounce(() => {
      if (sniffedItemId && sniffedItemId !== active?.itemId) { stop(); start(); }
    }, 800));
    attrObs.observe(video, { attributes: true, attributeFilter: ['src'] });

    resizeObs = new ResizeObserver(() => { try { onResize?.(); } catch { /* ignore */ } });
    resizeObs.observe(container);

    try { onMediaStart?.(active); } catch (e) { console.error('[CommentTrack]', e); }
  };

  // container mount/unmount
  const bodyObs = new MutationObserver(() => {
    const hasPlayer = !!document.querySelector('.videoPlayerContainer');
    if (hasPlayer) start(); else stop();
  });
  bodyObs.observe(document.body, { childList: true, subtree: false });

  // safety net: jellyfin-web rebuilds the OSD without touching .videoPlayerContainer
  pollId = window.setInterval(() => { if (document.querySelector('.videoPlayerContainer')) start(); }, 1000);
  window.addEventListener('fullscreenchange', () => { try { onResize?.(); } catch { /* ignore */ } });

  return () => {
    bodyObs.disconnect();
    window.clearInterval(pollId);
    stop();
  };
}
