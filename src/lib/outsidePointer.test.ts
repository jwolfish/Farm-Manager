import { describe, it, expect } from 'vitest';
import { isOutsideAll, type ContainerLike } from './outsidePointer';

/** A stand-in for an element that contains a known set of nodes. */
const container = (...owned: unknown[]): ContainerLike => ({
  contains: (node) => owned.includes(node),
});

const trigger = Symbol('trigger');
const popoverRow = Symbol('popover row');
const sheetRow = Symbol('sheet row');
const pageBackground = Symbol('page background');

describe('isOutsideAll', () => {
  it('is false for a press inside any registered container', () => {
    const popover = container(popoverRow);
    const sheet = container(sheetRow);
    expect(isOutsideAll(popoverRow, [popover, sheet])).toBe(false);
    expect(isOutsideAll(sheetRow, [popover, sheet])).toBe(false);
  });

  it('is true for a press that is inside none of them', () => {
    expect(isOutsideAll(pageBackground, [container(popoverRow), container(sheetRow)])).toBe(true);
  });

  /*
   * THE REGRESSION. The bottom sheet was not registered, so every press on a menu row on a
   * phone read as "outside": the menu closed on mousedown, the row unmounted before mouseup,
   * and no click was ever dispatched. The menu opened and every option did nothing.
   *
   * This assertion is the bug, kept as the reason the containers list must be complete.
   */
  it('reports a press inside an UNREGISTERED container as outside — the mobile defect', () => {
    const onlyThePopover = [container(popoverRow)];
    expect(isOutsideAll(sheetRow, onlyThePopover)).toBe(true);
    // ...and registering it is the fix.
    expect(isOutsideAll(sheetRow, [container(popoverRow), container(sheetRow)])).toBe(false);
  });

  it('treats the trigger as inside, so pressing it does not close and reopen', () => {
    expect(isOutsideAll(trigger, [container(trigger), container(popoverRow)])).toBe(false);
  });

  it('ignores containers that are null — a ref that has not attached yet', () => {
    expect(isOutsideAll(sheetRow, [null, undefined, container(sheetRow)])).toBe(false);
    expect(isOutsideAll(sheetRow, [null, undefined])).toBe(true);
  });

  it('closes on a null target rather than leaving an overlay open on an unattributable press', () => {
    expect(isOutsideAll(null, [container(sheetRow)])).toBe(true);
    expect(isOutsideAll(undefined, [container(sheetRow)])).toBe(true);
  });

  it('closes when there are no containers at all', () => {
    expect(isOutsideAll(sheetRow, [])).toBe(true);
  });
});
