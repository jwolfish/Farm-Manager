import { useState } from 'react';
import {
  ClipboardList,
  Trash2,
  Eye,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SavedWorkOrder } from '../lib/workOrderCrud';
import type { CropType } from '../lib/database.types';

const CROP_LABELS: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<string, { badge: string; badgeText: string }> = {
  corn: { badge: 'bg-amber-100', badgeText: 'text-amber-800' },
  soybeans: { badge: 'bg-green-100', badgeText: 'text-green-800' },
  wheat: { badge: 'bg-orange-100', badgeText: 'text-orange-800' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  applied: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Applied' },
  unapplied: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unapplied' },
};

interface Props {
  workOrders: SavedWorkOrder[];
  loading: boolean;
  onView: (wo: SavedWorkOrder) => void;
  onDelete: (woId: string) => void;
  onApply: (wo: SavedWorkOrder) => void;
  onUnapply: (wo: SavedWorkOrder) => void;
}

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SavedWorkOrdersList({ workOrders, loading, onView, onDelete, onApply, onUnapply }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (workOrders.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ClipboardList className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Saved Work Orders</h2>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {workOrders.length}
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 space-y-3">
          {workOrders.map((wo) => {
            const statusStyle = STATUS_STYLES[wo.status] ?? STATUS_STYLES.draft;
            const cropCol = CROP_COLORS[wo.crop_type] ?? CROP_COLORS.corn;
            const hasUnlinked = wo.lines.some((l) => !l.master_product_id);

            return (
              <div
                key={wo.id}
                className="border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-gray-900 truncate">{wo.program_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cropCol.badge} ${cropCol.badgeText}`}>
                        {CROP_LABELS[wo.crop_type] ?? wo.crop_type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{wo.fields.length} field{wo.fields.length !== 1 ? 's' : ''}</span>
                      <span className="text-gray-300">|</span>
                      <span>{fmtAcres(wo.total_acreage)} ac</span>
                      <span className="text-gray-300">|</span>
                      <span>{wo.lines.length} chemical{wo.lines.length !== 1 ? 's' : ''}</span>
                      <span className="text-gray-300">|</span>
                      <span>{fmtDate(wo.created_at)}</span>
                    </div>
                    {hasUnlinked && wo.status === 'draft' && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Some chemicals not linked to inventory</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onView(wo)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {wo.status === 'draft' && (
                      <button
                        onClick={() => onApply(wo)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title="Mark applied (deduct from inventory)"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}

                    {wo.status === 'applied' && (
                      <button
                        onClick={() => onUnapply(wo)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Unapply (reverse inventory deduction)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}

                    {wo.status === 'draft' && (
                      confirmDeleteId === wo.id ? (
                        <button
                          onClick={() => { onDelete(wo.id); setConfirmDeleteId(null); }}
                          className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(wo.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
