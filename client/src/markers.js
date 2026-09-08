/**
 * Small tick marks on the native jellyfin-web scrubber (`.osdPositionSlider`)
 * at each comment's timecode - click one to jump straight there.
 *
 * This is our OWN absolutely-positioned overlay anchored to the slider's own
 * parent, not Jellyfin's private per-element `getMarkerInfo()` hook that
 * chapter/intro markers use internally - that hook depends on an internal
 * `.sliderMarkerContainer` element whose presence on the *position* slider
 * specifically isn't something we could confirm without a live browser, so
 * leaning on it risked silently rendering nothing. Our own overlay only
 * assumes "the slider has a parent to anchor to", which is always true.
 *
 * jellyfin-web tears down and rebuilds the OSD on its own schedule, so this
 * polls to (re)find the slider - same pattern as compose.js's button.
 */
const SLIDER_SELECTOR = '.osdPositionSlider';
const TRACK_CLASS = 'ct-marker-track';

/**
 * @param {{ video: HTMLVideoElement }} ctx
 * @param {() => Array<object>} getComments returns the live comment list
 * @returns {{ refresh: () => void, destroy: () => void }}
 */
export function mountProgressMarkers(ctx, getComments) {
  ensureStyle();
  let host = null;
  let track = null;

  const teardownTrack = () => {
    track?.remove();
    track = null;
    host = null;
  };

  const render = () => {
    if (!track) return;
    const duration = ctx.video?.duration;
    track.innerHTML = '';
    if (!duration || !isFinite(duration)) return;
    for (const c of getComments()) {
      const posMs = c.positionMs ?? c.PositionMs ?? 0;
      const pct = Math.min(100, Math.max(0, (posMs / 1000 / duration) * 100));
      const dot = document.createElement('div');
      dot.className = 'ct-marker-dot';
      dot.style.left = `${pct}%`;
      dot.title = String(c.body ?? c.Body ?? '').slice(0, 80);
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ctx.video && isFinite(ctx.video.duration)) {
          ctx.video.currentTime = (pct / 100) * ctx.video.duration;
        }
      });
      track.appendChild(dot);
    }
  };

  const ensure = () => {
    const slider = document.querySelector(SLIDER_SELECTOR);
    const nextHost = slider?.parentElement;
    if (!nextHost) return;
    if (host === nextHost && track?.isConnected) {
      render();
      return;
    }
    teardownTrack();
    host = nextHost;
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    track = document.createElement('div');
    track.className = TRACK_CLASS;
    host.appendChild(track);
    render();
  };

  ensure();
  const tick = window.setInterval(ensure, 1000);
  const onMeta = () => render();
  ctx.video?.addEventListener('loadedmetadata', onMeta);

  return {
    refresh: render,
    destroy: () => {
      window.clearInterval(tick);
      ctx.video?.removeEventListener('loadedmetadata', onMeta);
      teardownTrack();
    },
  };
}

function ensureStyle() {
  if (document.getElementById('comment-track-marker-style')) return;
  const st = document.createElement('style');
  st.id = 'comment-track-marker-style';
  st.textContent = `
  .${TRACK_CLASS} { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
  .ct-marker-dot {
    position: absolute; top: 50%; width: 6px; height: 6px; margin-left: -3px;
    transform: translateY(-50%); border-radius: 50%; background: #00a4dc;
    box-shadow: 0 0 0 1.5px rgba(0,0,0,.6); pointer-events: auto; cursor: pointer;
  }
  .ct-marker-dot:hover { background: #4fd0ff; transform: translateY(-50%) scale(1.5); }
  `;
  document.head.appendChild(st);
}
