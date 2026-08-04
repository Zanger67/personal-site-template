/**
 * Tab-panel transitions — the page transition, scaled down to a panel.
 *
 * Swapping tabs fades the outgoing panel down and the incoming one up from
 * slightly below, the same shape as a page navigation (BaseLayout's `is-leaving`
 * + `main`'s `page-enter`), only quicker and with a smaller lift: a panel is a
 * smaller unit than a page, and the tab bar itself updates instantly so the
 * click still feels immediate.
 *
 * This is the timing half; the CSS half is `.panel-leaving` / `.panel-entering`
 * in global.css (with the `--panel-*-duration` vars this file's constant mirrors).
 * Every tab group on the site shares it — the /works tabs and the experience
 * drawer's related tabs — so they can't drift apart.
 */

/** Keep in sync with `--panel-leave-duration` in global.css. */
export const PANEL_LEAVE_MS = 130;

type Apply = () => HTMLElement | null;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Restart the arrival animation, even if the same panel is already wearing it. */
function enter(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('panel-entering');
  void el.offsetWidth; // reflow — otherwise re-adding the class in the same frame is a no-op
  el.classList.add('panel-entering');
}

/**
 * One fader per tab group, so groups keep independent timers.
 *
 * Call it with the panel currently on screen and an `apply` that performs the
 * real swap (setting `hidden`) and returns the panel it just revealed. `apply`
 * runs *after* the fade-out, so the visible content only changes once the old
 * panel is gone.
 *
 * Re-entrant: clicking through tabs faster than the fade doesn't queue up a
 * fade each — the in-flight one simply lands on whichever tab was asked for last.
 * Pass `{ animate: false }` (or call it with no current panel — first paint, or
 * reduced motion) for an instant swap that also cancels any fade in flight.
 */
export function createPanelFader() {
  let timer = 0;
  let leaving: HTMLElement | null = null;
  let pending: Apply | null = null;

  /** Run the queued swap now and let the panel it left go back to full opacity. */
  const finish = (): HTMLElement | null => {
    if (timer) { clearTimeout(timer); timer = 0; }
    const apply = pending;
    const out = leaving;
    pending = null;
    leaving = null;
    const shown = apply ? apply() : null;
    // Cleared only after the swap has hidden it — clearing it while still
    // on screen would flash the old panel back at full opacity.
    if (out) out.classList.remove('panel-leaving');
    return shown;
  };

  return function swapPanel(current: HTMLElement | null, apply: Apply, opts?: { animate?: boolean }) {
    pending = apply;

    if (opts?.animate === false || !current || prefersReducedMotion()) {
      if (leaving) leaving.classList.remove('panel-leaving');
      leaving = null;
      finish();
      return;
    }

    // An arrival still in flight would outrank the fade-out (animations beat
    // transitions), so the incoming panel gives up its animation to leave.
    current.classList.remove('panel-entering');
    current.classList.add('panel-leaving');
    leaving = current;

    if (!timer) timer = window.setTimeout(() => enter(finish()), PANEL_LEAVE_MS);
  };
}
