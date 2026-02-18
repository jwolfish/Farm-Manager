import { RotateCcw } from 'lucide-react';

interface OverrideBadgeProps {
  isOverridden: boolean;
  templateValue?: number;
  onReset?: () => void;
}

export function OverrideBadge({ isOverridden, templateValue, onReset }: OverrideBadgeProps) {
  if (!isOverridden) return null;

  return (
    <div className="inline-flex items-center gap-2">
      <div className="group relative">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
          Custom
        </span>
        {templateValue !== undefined && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
            Template value: ${templateValue.toFixed(2)}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="text-amber-600 hover:text-amber-800 transition-colors"
          title="Reset to template value"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
