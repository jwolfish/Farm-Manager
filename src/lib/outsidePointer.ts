/**
 * "Did this press land outside every part of the open thing?" — extracted so the answer can
 * be tested, per the `resolveAppLoadPresentation` / `describeRenderError` pattern.
 *
 * IT IS EXTRACTED BECAUSE IT WAS WRONG. `ActionMenu` renders in two places — a popover from
 * `sm:` up and a bottom sheet below it — and the first version registered only the popover.
 * On a phone every press on a menu row was therefore judged "outside": the menu closed on
 * `mousedown`, the row unmounted before `mouseup`, and no `click` was ever dispatched. The
 * menu opened and every option did nothing. Desktop was unaffected, because there the press
 * landed inside the one container that was registered.
 *
 * The rule is the whole content: a press is outside only when it is inside NONE of the
 * containers, and a container that is absent from the list cannot be consulted — which is
 * exactly how one of two got forgotten.
 */

/** The part of `Node`/`Element` this needs. Narrow, so tests need no DOM. */
export interface ContainerLike {
  contains(node: unknown): boolean;
}

/**
 * True when the menu should close.
 *
 * A null target closes: a press with no target cannot be shown to be inside anything, and
 * leaving an overlay open on an event nobody can attribute is the worse failure.
 */
export function isOutsideAll(
  target: unknown,
  containers: readonly (ContainerLike | null | undefined)[]
): boolean {
  if (target == null) return true;
  return !containers.some((c) => c != null && c.contains(target));
}
