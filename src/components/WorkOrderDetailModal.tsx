import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, AlertTriangle, Package } from 'lucide-react';
import { ResponsiveModal } from './ResponsiveModal';
import type { SavedWorkOrder } from '../lib/workOrderCrud';
import { toBestPracticalUnit } from '../lib/unitConversions';
import { convertUnits } from '../lib/unitConversions';
import { supabase } from '../lib/supabase';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  applied: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Applied' },
  unapplied: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unapplied' },
};

const CROP_LABELS: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

interface InventoryInfo {
  onHand: number;
  unitType: string;
}

interface Props {
  workOrder: SavedWorkOrder;
  inventoryMap?: Map<string, InventoryInfo>;
  onApply: (wo: SavedWorkOrder) => void;
  onUnapply: (wo: SavedWorkOrder) => void;
  onClose: () => void;
  /** A viewer may read a work order and may not apply or unapply it. */
  readOnly?: boolean;
}

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function WorkOrderDetailModal({ workOrder: wo, onApply, onUnapply, onClose, readOnly = false }: Props) {
  const [invMap, setInvMap] = useState<Map<string, InventoryInfo>>(new Map());
  const [invError, setInvError] = useState(false);

  useEffect(() => {
    const productIds = wo.lines
      .map((l) => l.master_product_id)
      .filter((id): id is string => id != null);
    if (productIds.length === 0) return;

    supabase
      .from('master_products')
      .select('id, on_hand_quantity, unit_type')
      .in('id', productIds)
      .then(({ data, error }) => {
        // Said on screen rather than logged: an empty on-hand column otherwise reads as
        // "nothing in the shed", and the low-stock warning silently never appears.
        if (error || !data) {
          setInvError(true);
          return;
        }
        const map = new Map<string, InventoryInfo>();
        for (const row of data) {
          map.set(row.id, { onHand: Number(row.on_hand_quantity ?? 0), unitType: row.unit_type });
        }
        setInvMap(map);
      });
  }, [wo.lines]);

  const statusStyle = STATUS_STYLES[wo.status] ?? STATUS_STYLES.draft;
  // An unapplied order can be applied again (WI-9) — the saved list already offers it.
  const canApply = wo.status === 'draft' || wo.status === 'unapplied';
  const hasUnlinked = wo.lines.some((l) => !l.master_product_id);
  const lowStockCount = wo.lines.filter((l) => {
    if (!l.master_product_id) return false;
    const inv = invMap.get(l.master_product_id);
    if (!inv) return false;
    const needed = convertUnits(l.rate_unit, inv.unitType, l.total_needed);
    // Cannot compare across units that will not convert, so this is not
    // claimed as low stock. Apply blocks on it separately.
    if (!needed.ok) return false;
    return needed.value > inv.onHand;
  }).length;

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size="lg"
      title={wo.program_name}
      subtitle={`${CROP_LABELS[wo.crop_type] ?? wo.crop_type} · ${fmtAcres(wo.total_acreage)} ac · Saved ${fmtDate(wo.created_at)}`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>

          {!readOnly && canApply && (
            <button
              type="button"
              onClick={() => onApply(wo)}
              disabled={hasUnlinked}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg transition-colors shadow-sm ${
                hasUnlinked
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
              title={hasUnlinked ? 'Link all chemicals to inventory before applying' : 'Mark applied and deduct from inventory'}
            >
              <CheckCircle2 className="w-4 h-4" />
              {wo.status === 'unapplied' ? 'Re-apply' : 'Apply'}
            </button>
          )}

          {!readOnly && wo.status === 'applied' && (
            <button
              type="button"
              onClick={() => onUnapply(wo)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Unapply
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-5">
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </span>

        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
            {lowStockCount} chemical{lowStockCount !== 1 ? 's' : ''} exceed{lowStockCount === 1 ? 's' : ''} current on-hand inventory
          </div>
        )}

        {invError && (
          <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Could not load on-hand inventory, so stock is not shown or checked here.
          </div>
        )}

        {hasUnlinked && canApply && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
            <Package className="w-4 h-4 flex-shrink-0 text-blue-500" />
            Some chemicals are not linked to inventory products. Link them before applying to track consumption.
          </div>
        )}

        {/* Fields */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fields</p>
          <div className="flex flex-wrap gap-1.5">
            {wo.fields.map((f) => (
              <span
                key={f.id}
                className="inline-block bg-gray-100 rounded-md px-2.5 py-1 text-xs font-medium text-gray-700"
              >
                {f.field_name} <span className="text-gray-400">({fmtAcres(f.acreage)} ac)</span>
              </span>
            ))}
          </div>
        </div>

        {/* Chemical lines */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chemical Mix</p>
          <div className="border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 text-xs">Chemical</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs">Rate/Acre</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs">Total Needed</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs">On Hand</th>
                </tr>
              </thead>
              <tbody>
                {wo.lines.map((line, i) => {
                  const inv = line.master_product_id ? invMap.get(line.master_product_id) : undefined;
                  const onHand = inv?.onHand ?? null;
                  const neededInInvUnit = inv ? convertUnits(line.rate_unit, inv.unitType, line.total_needed) : null;
                  const isLow =
                    onHand !== null && neededInInvUnit !== null && neededInInvUnit.ok && neededInInvUnit.value > onHand;
                  const totalDisplay = toBestPracticalUnit(line.total_needed, line.rate_unit).display;
                  const onHandDisplay = onHand !== null
                    ? `${onHand.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${inv!.unitType}`
                    : '—';

                  return (
                    <tr
                      key={line.id}
                      className={`border-b border-gray-50 last:border-0 ${isLow ? 'bg-amber-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    >
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        <div className="flex items-center gap-1.5">
                          {line.chemical_name}
                          {!line.master_product_id && (
                            <span className="text-[10px] bg-gray-200 text-gray-500 px-1 py-0.5 rounded">unlinked</span>
                          )}
                          {isLow && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">
                        {line.rate_per_acre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {line.rate_unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{totalDisplay}</td>
                      <td className={`py-2.5 px-3 text-right ${isLow ? 'font-semibold text-amber-600' : 'text-gray-500'}`}>
                        {onHandDisplay}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Timestamps */}
        {(wo.applied_at || wo.unapplied_at) && (
          <div className="text-xs text-gray-400 space-y-0.5">
            {wo.applied_at && <p>Applied: {fmtDate(wo.applied_at)}</p>}
            {wo.unapplied_at && <p>Unapplied: {fmtDate(wo.unapplied_at)}</p>}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
