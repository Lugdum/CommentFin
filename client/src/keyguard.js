/**
 * Stops keystrokes typed into one of our text inputs from leaking out to
 * page-level hotkeys - Jellyfin's own shortcuts (space = play/pause, etc.)
 * and browser extensions (Vimium's "s" hint trigger and the like).
 *
 * A plain `stopPropagation()` on the input's own keydown listener is not
 * enough: if Jellyfin (or an extension) listens in the CAPTURE phase on
 * `document`/`window`, that handler already runs before the event ever
 * reaches our input, so stopping it at the target is too late. The fix is to
 * intercept just as early ourselves, with a capture-phase listener on
 * `document`, and to do so for every key event type, not just keydown.
 *
 * Because stopping propagation at that point also prevents the event from
 * ever reaching the input's own bubble-phase listeners, this module owns
 * BOTH the containment and the Enter/Escape handling in one place, rather
 * than splitting them across two listeners.
 */

const EVENT_TYPES = ['keydown', 'keyup', 'keypress'];

/**
 * @param {HTMLInputElement} input the field to protect (only intercepts while it has focus)
 * @param {{ onEnter?: () => void, onEscape?: () => void }} [handlers]
 * @returns {() => void} teardown
 */
export function guardInput(input, handlers = {}) {
  const onEvent = (e) => {
    if (document.activeElement !== input) return;
    if (e.type === 'keydown') {
      if (e.key === 'Enter') { e.preventDefault(); handlers.onEnter?.(); }
      else if (e.key === 'Escape') { e.preventDefault(); handlers.onEscape?.(); }
    }
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  EVENT_TYPES.forEach((type) => document.addEventListener(type, onEvent, { capture: true }));
  return () => EVENT_TYPES.forEach((type) => document.removeEventListener(type, onEvent, { capture: true }));
}
