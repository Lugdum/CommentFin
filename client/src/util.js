/** Collapses bursts of calls into one, `ms` after the last one. Used to keep
 * the whole-page MutationObservers (settings-ui.js, drawer.js, player.js)
 * cheap - jellyfin-web mutates the DOM constantly (list virtualization,
 * animations…) and none of what we're watching for needs an instant reaction. */
export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
