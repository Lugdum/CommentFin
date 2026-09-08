/**
 * "Comments" entry in the left navigation drawer, so settings and comment
 * management are reachable outside of video playback.
 *
 * jellyfin-web rebuilds the drawer on navigation, so we re-inject via a
 * MutationObserver. Selectors are jellyfin-web internals - defensive: if the
 * drawer shape changes we simply don't add the entry.
 */
import { openSettingsPanel } from './settings-ui.js';
import { t } from './i18n.js';
import { debounce } from './util.js';

const ENTRY_CLASS = 'comment-track-drawer-entry';

export function mountDrawerEntry(getOverlay) {
  const inject = () => {
    const container =
      document.querySelector('.mainDrawer-scrollContainer') ||
      document.querySelector('.mainDrawer');
    if (!container || container.querySelector(`.${ENTRY_CLASS}`)) return;

    const links = container.querySelectorAll('.navMenuOption');
    if (!links.length) return; // drawer not populated yet

    const entry = document.createElement('a');
    entry.className = `navMenuOption emby-button ${ENTRY_CLASS}`;
    entry.href = '#';
    entry.setAttribute('is', 'emby-linkbutton');
    entry.innerHTML =
      '<span class="material-icons navMenuOptionIcon" aria-hidden="true">forum</span>' +
      `<span class="navMenuOptionText">${t('nav.comments')}</span>`;
    entry.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
      openSettingsPanel(getOverlay);
    });

    // place it just before the admin section / a divider if there is one,
    // else after the last user nav option.
    const boundary = container.querySelector(
      '.navMenuDivider, .adminMenuOptions, .navMenuOption-adminMenuHeader',
    );
    if (boundary) boundary.parentNode.insertBefore(entry, boundary);
    else links[links.length - 1].after(entry);
  };

  inject();
  // subtree:true on <body> fires on every DOM mutation anywhere in the app -
  // debounced so it doesn't re-scan on every unrelated render.
  const obs = new MutationObserver(debounce(inject, 150));
  obs.observe(document.body, { childList: true, subtree: true });
}

function closeDrawer() {
  const scrim = document.querySelector('.drawerScrim, .dialogBackdrop.drawer-backdrop');
  if (scrim) scrim.click();
}
