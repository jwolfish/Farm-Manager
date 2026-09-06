import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { describeRenderError, RenderErrorPresentation } from '../lib/renderErrorState';

/*
 * R-6 — one bad render degrades one region instead of blanking the app.
 *
 * Before this there was no boundary anywhere, so any uncaught render error unmounted
 * the whole tree and left a white page. That is the same *symptom* R-1 removed for a
 * transient load, arriving by a different route — and the remaining WI-19 nullability
 * errors are exactly the class of bug that would produce it, since the app's
 * hand-written interfaces declare several nullable columns non-null.
 *
 * The panel is a separate exported function with no Supabase import, so it can be
 * rendered against fixtures on a machine with no credentials. Every screen in this
 * project that shipped "not opened in a browser" did so because its import chain
 * reached the Supabase client at module load.
 */

export interface RenderErrorAction {
  label: string;
  onClick: () => void;
}

export function RenderErrorPanel({
  presentation,
  onRetry,
  action,
}: {
  presentation: RenderErrorPresentation;
  onRetry: () => void;
  /**
   * A way out, for a region that carries its own navigation. Without it a screen
   * rendered outside DashboardLayout — FieldDetail is the only one — becomes a dead
   * end when it throws, which is the blank page this work exists to remove.
   */
  action?: RenderErrorAction;
}) {
  return (
    <div role="alert" className="flex items-start justify-center p-6 sm:p-10">
      <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="bg-red-100 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{presentation.title}</p>
            <p className="text-sm text-gray-600 mt-1">{presentation.detail}</p>
          </div>
        </div>

        {/* py-3 keeps these at a >=44px tap target, per the design doc's rule for new controls. */}
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          {presentation.offerReload && (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload the page
            </button>
          )}
          {presentation.offerRetry && (
            <button
              onClick={onRetry}
              className={
                presentation.offerReload
                  ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors'
                  : 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors'
              }
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>

        {/*
         * Collapsed, not hidden. SEC-8's rule is that raw error text must not be the
         * user-facing message; it does not say the owner may never see it, and "it just
         * broke" with nothing to quote is what makes a fault unreportable.
         */}
        {presentation.technicalDetail && (
          <details className="mt-4">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Technical detail
            </summary>
            <p className="mt-2 text-xs font-mono text-gray-600 break-words whitespace-pre-wrap">
              {presentation.technicalDetail}
            </p>
          </details>
        )}
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** What failed, in words a user recognises — "the Products page". */
  label?: string;
  /**
   * Change this to clear a caught error. Pass the active page so that navigating away
   * from a broken screen recovers it; without this a region that threw once stays
   * broken until a reload, which is the blank-page problem in miniature.
   */
  resetKey?: unknown;
  /** A way out for a region that carries its own navigation. See RenderErrorPanel. */
  action?: RenderErrorAction;
}

interface ErrorBoundaryState {
  error: unknown;
  caught: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, caught: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, caught: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error(
      `Render error caught by boundary${this.props.label ? ` (${this.props.label})` : ''}:`,
      error,
      info?.componentStack
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.caught && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, caught: false });
    }
  }

  handleRetry = () => {
    this.setState({ error: null, caught: false });
  };

  render() {
    if (this.state.caught) {
      return (
        <RenderErrorPanel
          presentation={describeRenderError(this.state.error, this.props.label)}
          onRetry={this.handleRetry}
          action={this.props.action}
        />
      );
    }
    return this.props.children;
  }
}
