import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A modal that is a bottom sheet on a phone and a centred card from `sm:` up.
 *
 * Built with F-4 as one of the two shared primitives agreed for mobile
 * readiness. The existing modals in this app are all
 * `fixed inset-0 flex items-center justify-center p-4` with a `max-w-md` panel,
 * so this is deliberately a drop-in replacement for them later: same overlay,
 * same close affordance, same panel width on desktop.
 *
 * Retrofitting those screens is explicitly out of scope. This exists so the
 * retrofit is a component swap rather than a redesign.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sticky footer, typically the submit/cancel pair. */
  footer?: ReactNode;
  children: ReactNode;
  /** Widen for content that needs it, e.g. a multi-line load ticket. */
  size?: 'md' | 'lg';
}

export function ResponsiveModal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  size = 'md',
}: Props) {
  // Escape closes. The overlay click already does; a keyboard user needs this.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Stop the page behind the sheet from scrolling with it on touch.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className={`relative bg-white w-full flex flex-col max-h-[92vh]
                    rounded-t-2xl sm:rounded-2xl shadow-xl
                    ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        {/* Grab handle: a phone affordance, meaningless on desktop. */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6 pb-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            /* py-3 keeps this at a 44px tap target; the app's usual py-2 is ~36. */
            className="-mr-2 -mt-2 p-3 text-gray-400 hover:text-gray-600 rounded-lg shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 overflow-y-auto grow">{children}</div>

        {footer && (
          <div className="px-6 py-4 pb-6 sm:pb-4 border-t border-gray-100 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}
