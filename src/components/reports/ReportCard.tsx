import { ReactNode } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';

interface ReportCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
}

export function ReportCard({
  title,
  description,
  children,
  loading = false,
  error = null,
  onExportCSV,
  onExportPDF,
}: ReportCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
        {!loading && !error && (onExportCSV || onExportPDF) && (
          <div className="flex items-center gap-2 shrink-0">
            {onExportPDF && (
              <button
                onClick={onExportPDF}
                className="flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Export PDF
              </button>
            )}
            {onExportCSV && (
              <button
                onClick={onExportCSV}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 bg-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
