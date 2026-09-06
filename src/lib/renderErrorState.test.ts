import { describe, it, expect } from 'vitest';
import { classifyRenderError, describeRenderError, messageOf } from './renderErrorState';

/*
 * The value in these is the negative cases. Classifying a chunk failure correctly is
 * easy; the way this goes wrong in practice is over-matching, so that an ordinary
 * network failure tells the user to reload — advice that cannot work, because the
 * reload needs the same network.
 */

describe('classifyRenderError — real browser wordings', () => {
  it('recognises the Chrome/Edge wording', () => {
    expect(
      classifyRenderError(
        new Error('Failed to fetch dynamically imported module: https://app/assets/x-a1b2.js')
      )
    ).toBe('chunk-load');
  });

  it('recognises the Firefox wording, which differs only in case', () => {
    expect(
      classifyRenderError(
        new Error('error loading dynamically imported module: https://app/assets/x-a1b2.js')
      )
    ).toBe('chunk-load');
  });

  it('recognises the Safari wording, which names no module', () => {
    expect(classifyRenderError(new Error('Importing a module script failed.'))).toBe('chunk-load');
  });

  it("recognises Vite's CSS preload failure", () => {
    expect(
      classifyRenderError(new Error('Unable to preload CSS for /assets/FertilizerContractsTab.css'))
    ).toBe('chunk-load');
  });
});

describe('classifyRenderError — what must NOT be called a chunk failure', () => {
  it('does not match a bare failed data request', () => {
    // Telling someone to reload here is wrong: the reload needs the same network.
    expect(classifyRenderError(new TypeError('Failed to fetch'))).toBe('render');
  });

  it('does not match a network error', () => {
    expect(classifyRenderError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      'render'
    );
  });

  it('does not match an ordinary null-property render crash', () => {
    expect(
      classifyRenderError(new TypeError("Cannot read properties of null (reading 'name')"))
    ).toBe('render');
  });

  it('does not match a Postgres error surfaced through a render', () => {
    expect(classifyRenderError(new Error('column fields.acreage does not exist'))).toBe('render');
  });
});

describe('classifyRenderError — things React can throw that are not Errors', () => {
  it('handles a thrown string', () => {
    expect(classifyRenderError('Failed to fetch dynamically imported module: /x.js')).toBe(
      'chunk-load'
    );
  });

  it('handles null without throwing', () => {
    expect(classifyRenderError(null)).toBe('render');
  });

  it('handles undefined without throwing', () => {
    expect(classifyRenderError(undefined)).toBe('render');
  });

  it('handles an object carrying a message', () => {
    expect(classifyRenderError({ message: 'Importing a module script failed.' })).toBe('chunk-load');
  });

  it('handles an object whose message is not a string', () => {
    expect(classifyRenderError({ message: { nested: true } })).toBe('render');
  });
});

describe('messageOf', () => {
  it('reads an Error', () => {
    expect(messageOf(new Error('boom'))).toBe('boom');
  });

  it('returns empty for a thrown number rather than stringifying it misleadingly', () => {
    expect(messageOf(42)).toBe('');
  });
});

describe('describeRenderError', () => {
  it('offers a reload ONLY for a chunk-load failure', () => {
    const chunk = describeRenderError(new Error('Failed to fetch dynamically imported module: /x'));
    expect(chunk.offerReload).toBe(true);

    const render = describeRenderError(new TypeError('Cannot read properties of null'));
    expect(render.offerReload).toBe(false);
  });

  it('always offers a retry, so no region is a dead end', () => {
    expect(describeRenderError(new Error('anything')).offerRetry).toBe(true);
    expect(describeRenderError(new Error('Importing a module script failed.')).offerRetry).toBe(
      true
    );
  });

  it('names the failing region when given a label', () => {
    expect(describeRenderError(new Error('x'), 'the Products page').detail).toContain(
      'the Products page'
    );
  });

  it('falls back to neutral wording with no label', () => {
    expect(describeRenderError(new Error('x')).detail).toContain('this part of the app');
  });

  it('keeps the raw message out of the headline and in technicalDetail', () => {
    const raw = 'column fields.acreage does not exist';
    const p = describeRenderError(new Error(raw));
    // SEC-8: raw error text is logged and available, never the user-facing message.
    expect(p.title).not.toContain(raw);
    expect(p.detail).not.toContain(raw);
    expect(p.technicalDetail).toBe(raw);
  });

  it('reassures that saved data is unaffected in both cases', () => {
    expect(describeRenderError(new Error('x')).detail).toContain('nothing you have saved');
    expect(
      describeRenderError(new Error('Failed to fetch dynamically imported module: /x')).detail
    ).toContain('Nothing you have saved');
  });
});
