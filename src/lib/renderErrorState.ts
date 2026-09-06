/*
 * R-6 — what an error boundary should show, as a pure decision.
 *
 * Same pattern as `appLoadState.ts`: the boundary itself is a React class component
 * that cannot be rendered on a machine with no Supabase credentials, so the *rule* it
 * follows lives here where it can be tested directly. The component decides nothing.
 *
 * The one distinction that matters is a failed dynamic `import()`. After a deploy the
 * old chunk filenames are gone, so a tab that has been open across a deploy throws when
 * it lazily loads a panel — and a page reload genuinely fixes it. That is the ONLY
 * situation where telling the user to reload is the correct answer; for every other
 * render error a reload just replays it after destroying whatever else was on screen.
 */

export type RenderErrorKind = 'chunk-load' | 'render';

export interface RenderErrorPresentation {
  kind: RenderErrorKind;
  title: string;
  detail: string;
  /** Offer a full page reload. Correct only for a chunk-load failure. */
  offerReload: boolean;
  /** Offer to re-render the failed region without reloading. Always available. */
  offerRetry: boolean;
  /** The raw message, for a collapsed technical-detail block. Never the headline. */
  technicalDetail: string;
}

/*
 * The wording differs per browser and there is no error code to key on, so this is
 * substring matching and has to be. Collected rather than invented:
 *
 *   Chrome / Edge  "Failed to fetch dynamically imported module: <url>"
 *   Firefox        "error loading dynamically imported module: <url>"
 *   Safari         "Importing a module script failed."
 *   Vite preload   "Unable to preload CSS for <url>"
 *
 * Deliberately NOT matched: a bare "Failed to fetch" or "NetworkError", which is what a
 * failed *data* request looks like. Matching those would tell someone to reload the page
 * when the network is down — the reload then fails too, and the advice was never right.
 */
const CHUNK_LOAD_SIGNATURES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css for',
  'failed to import',
  'loading chunk',
  'loading css chunk',
];

/** Pull a message out of anything React might have thrown. It need not be an Error. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

export function classifyRenderError(error: unknown): RenderErrorKind {
  const message = messageOf(error).toLowerCase();
  if (!message) return 'render';
  return CHUNK_LOAD_SIGNATURES.some((sig) => message.includes(sig)) ? 'chunk-load' : 'render';
}

/**
 * @param label What failed, in words a user recognises — "the Products page".
 *              Used in the panel heading so a region failure reads as one region.
 */
export function describeRenderError(error: unknown, label?: string): RenderErrorPresentation {
  const kind = classifyRenderError(error);
  const where = label ? label : 'this part of the app';

  if (kind === 'chunk-load') {
    return {
      kind,
      title: 'A new version is available',
      detail:
        'Crop Tracker was updated while this tab was open, so part of it could not be ' +
        'loaded. Reloading the page picks up the new version. Nothing you have saved is ' +
        'affected.',
      offerReload: true,
      offerRetry: true,
      technicalDetail: messageOf(error),
    };
  }

  return {
    kind,
    title: 'Something went wrong here',
    detail:
      `An error stopped ${where} from displaying. The rest of the app is still usable, ` +
      'and nothing you have saved is affected. Try again, or move to another page.',
    offerReload: false,
    offerRetry: true,
    technicalDetail: messageOf(error),
  };
}
