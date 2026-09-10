import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { isOutsideAll } from '../lib/outsidePointer';

/**
 * A labelled action menu — U-4. The third shared primitive, after `ResponsiveModal` and
 * `NumberField`, and built to the same rule: a popover on desktop, a bottom sheet on a
 * phone.
 *
 * It replaces a pair of unlabelled 30 px icon buttons sitting 8 px apart, which was both
 * the least discoverable control on the Fields page ("it's not obvious what that button
 * does") and the hardest to hit with a thumb. Text labels fix the first; one 44 px trigger
 * and full-width rows fix the second.
 *
 * WHY A SHEET RATHER THAN A POPOVER ON A PHONE. A popover anchored to a card in a scrolling
 * grid has to be positioned against the viewport, reposition on scroll, and flip when it is
 * near an edge — three chances to render a menu half off-screen, which is the MOB-2 defect
 * in miniature. A sheet is anchored to the bottom of the screen and cannot be any of those
 * things.
 */

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in red and sorts to the bottom behind a divider. */
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  items: readonly ActionMenuItem[];
  /** Names the menu for a screen reader — "Actions for Home West of Lane". */
  label: string;
  /** Heading on the phone sheet, where there is room for one. */
  sheetTitle?: string;
}

export function ActionMenu({ items, label, sheetTitle }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  /* The phone sheet's panel. Registered with the popover above — see the effect below. */
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Escape closes and focus goes back to the trigger, or a keyboard user is stranded.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /*
   * A press outside closes. BOTH renderings must be registered — this listener fires on
   * `mousedown`, so a container it does not know about is judged outside, the menu unmounts
   * before `mouseup`, and the browser never dispatches a `click` at all.
   *
   * That is exactly what shipped: only `popoverRef` was registered, so on a phone the menu
   * opened and every option did nothing, while desktop was fine. The decision is
   * `isOutsideAll` now, with the missing-container case pinned as a test.
   */
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (isOutsideAll(e.target, [popoverRef.current, sheetRef.current, triggerRef.current])) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const ordered = [...items.filter((i) => !i.destructive), ...items.filter((i) => i.destructive)];
  const firstDestructive = ordered.findIndex((i) => i.destructive);

  const choose = (item: ActionMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  const rows = ordered.map((item, index) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => choose(item)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors
                  disabled:cursor-not-allowed disabled:opacity-40
                  ${index === firstDestructive && index > 0 ? 'mt-1 border-t border-gray-100 pt-3' : ''}
                  ${item.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'}`}
    >
      {item.icon && <span className="shrink-0">{item.icon}</span>}
      {item.label}
    </button>
  ));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        /*
          p-3 on a w-5 icon measures 44px. It was written as p-2.5 with a comment claiming
          44, and rendering it said 40 — which would have shipped the "too small to hit"
          complaint inside the control that exists to fix it. Measure, do not assert.
        */
        className="rounded-lg p-3 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <>
          {/* Desktop: a popover anchored to the trigger's positioned ancestor. */}
          <div
            ref={popoverRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-lg border border-gray-200
                       bg-white py-1 shadow-lg sm:block"
          >
            {rows}
          </div>

          {/* Phone: a bottom sheet, matching ResponsiveModal's overlay and grab handle. */}
          <div className="fixed inset-0 z-50 flex items-end sm:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div
              ref={sheetRef}
              className="relative flex w-full flex-col rounded-t-2xl bg-white pb-6 shadow-xl"
            >
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1.5 w-10 rounded-full bg-gray-300" />
              </div>
              {sheetTitle && (
                <p className="truncate px-4 pb-2 pt-1 text-sm font-medium text-gray-500">{sheetTitle}</p>
              )}
              <div role="menu" aria-label={label}>
                {rows}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
