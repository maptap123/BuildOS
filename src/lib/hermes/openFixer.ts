/**
 * Opening Fixer from anywhere in the app
 * ======================================
 * The chat panel is mounted once in the dashboard layout and owns its own open
 * state, so a page deep in the tree has no prop or context to reach it through.
 * A window event is the smallest thing that spans that gap without threading a
 * provider through every route.
 *
 * The draft is put in the composer rather than sent, so the estimator reads what
 * is about to be asked and can adjust the scope first — these turn into priced
 * lines on a real estimate.
 */

export const OPEN_FIXER_EVENT = 'fixer:open'

export interface OpenFixerDetail {
  /** Prefills the composer. The user still presses send. */
  draft: string
}

/** Opens the Fixer panel with `draft` waiting in the composer. */
export function openFixerWith(draft: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<OpenFixerDetail>(OPEN_FIXER_EVENT, { detail: { draft } })
  )
}
