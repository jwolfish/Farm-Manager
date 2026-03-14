import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { HedgeEntryForm } from './HedgeEntryForm';
import { Pagination } from './Pagination';
import { cropConfig, formatDeliveryMonth, formatDate, formatCurrency, formatBushels, CONTRACT_TYPE_LABELS } from '../lib/salesUtils';
import type { CropType } from '../lib/database.types';

const HEDGES_PAGE_SIZE = 20;

export interface Hedge {
  id: string;
  contract_date: string;
  delivery_month: string;
  contract_type: string;
  broker_elevator: string;
  bushels_hedged: number;
  futures_price: number;
  basis: number;
  net_price: number;
  notes: string | null;
}

interface HedgeCommoditySectionProps {
  cropType: CropType;
  hedges: Hedge[];
  onAddHedge: (cropType: CropType, data: {
    contract_date: string;
    delivery_month: string;
    contract_type: string;
    broker_elevator: string;
    bushels_hedged: number;
    futures_price: number;
    basis: number;
    notes: string;
  }) => Promise<void>;
  onUpdateHedge: (hedgeId: string, data: {
    contract_date: string;
    delivery_month: string;
    contract_type: string;
    broker_elevator: string;
    bushels_hedged: number;
    futures_price: number;
    basis: number;
    notes: string;
  }) => Promise<void>;
  onDeleteHedge: (hedgeId: string) => Promise<void>;
}

export function HedgeCommoditySection({
  cropType,
  hedges,
  onAddHedge,
  onUpdateHedge,
  onDeleteHedge,
}: HedgeCommoditySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHedge, setEditingHedge] = useState<Hedge | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const config = cropConfig[cropType];

  const totalPages = Math.ceil(hedges.length / HEDGES_PAGE_SIZE);
  const paginatedHedges = hedges.slice((currentPage - 1) * HEDGES_PAGE_SIZE, currentPage * HEDGES_PAGE_SIZE);

  const totalBushels = hedges.reduce((sum, h) => sum + Number(h.bushels_hedged), 0);
  const weightedAvgNetPrice = totalBushels > 0
    ? hedges.reduce((sum, h) => sum + Number(h.bushels_hedged) * Number(h.net_price), 0) / totalBushels
    : 0;
  const weightedAvgFutures = totalBushels > 0
    ? hedges.reduce((sum, h) => sum + Number(h.bushels_hedged) * Number(h.futures_price), 0) / totalBushels
    : 0;
  const weightedAvgBasis = totalBushels > 0
    ? hedges.reduce((sum, h) => sum + Number(h.bushels_hedged) * Number(h.basis), 0) / totalBushels
    : 0;

  const handleAdd = async (data: {
    contract_date: string;
    delivery_month: string;
    contract_type: string;
    broker_elevator: string;
    bushels_hedged: number;
    futures_price: number;
    basis: number;
    notes: string;
  }) => {
    await onAddHedge(cropType, data);
    setShowAddForm(false);
  };

  const handleUpdate = async (data: {
    contract_date: string;
    delivery_month: string;
    contract_type: string;
    broker_elevator: string;
    bushels_hedged: number;
    futures_price: number;
    basis: number;
    notes: string;
  }) => {
    if (!editingHedge) return;
    await onUpdateHedge(editingHedge.id, data);
    setEditingHedge(null);
  };

  const handleDelete = async (hedgeId: string) => {
    if (!window.confirm('Are you sure you want to delete this hedge?')) return;
    await onDeleteHedge(hedgeId);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-6 py-4 ${config.headerBg} ${config.headerText} ${config.headerBorder} border-b transition-colors hover:opacity-90`}
      >
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold">{config.label}</h3>
          <div className="flex items-center gap-4 text-sm opacity-80">
            <span>{hedges.length} hedge{hedges.length !== 1 ? 's' : ''}</span>
            {totalBushels > 0 && (
              <>
                <span>{formatBushels(totalBushels)} bu</span>
                <span>Avg {formatCurrency(weightedAvgNetPrice)}/bu net</span>
              </>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {expanded && (
        <div className="p-6">
          {hedges.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Total Bushels Hedged</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>{formatBushels(totalBushels)}</div>
              </div>
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Avg Net Price</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>{formatCurrency(weightedAvgNetPrice)}</div>
                <div className={`text-xs ${config.summaryText} opacity-75`}>
                  Futures {formatCurrency(weightedAvgFutures)} / Basis {formatCurrency(weightedAvgBasis)}
                </div>
              </div>
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Locked-In Value</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>
                  {formatCurrency(totalBushels * weightedAvgNetPrice)}
                </div>
              </div>
            </div>
          )}

          {hedges.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Contract Date</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Delivery</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Broker / Elevator</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Bushels</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Futures</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Basis</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Net Price</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHedges.map((hedge) => (
                    <tr key={hedge.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-gray-900">{formatDate(hedge.contract_date)}</td>
                      <td className="py-3 px-3 text-gray-700">{formatDeliveryMonth(hedge.delivery_month)}</td>
                      <td className="py-3 px-3 text-gray-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {CONTRACT_TYPE_LABELS[hedge.contract_type] ?? hedge.contract_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-700">{hedge.broker_elevator || '-'}</td>
                      <td className="py-3 px-3 text-right text-gray-900 font-medium">{formatBushels(hedge.bushels_hedged)}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{formatCurrency(hedge.futures_price)}</td>
                      <td className={`py-3 px-3 text-right font-medium ${Number(hedge.basis) < 0 ? 'text-red-600' : Number(hedge.basis) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {Number(hedge.basis) >= 0 ? '+' : ''}{formatCurrency(hedge.basis)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-900 font-semibold">{formatCurrency(hedge.net_price)}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingHedge(hedge)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit hedge"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(hedge.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete hedge"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hedges.length > HEDGES_PAGE_SIZE && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  totalCount={hedges.length}
                  pageSize={HEDGES_PAGE_SIZE}
                />
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No {config.label.toLowerCase()} hedges recorded yet
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add {config.label} Hedge
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <HedgeEntryForm
          cropType={cropType}
          onSave={handleAdd}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {editingHedge && (
        <HedgeEntryForm
          cropType={cropType}
          onSave={handleUpdate}
          onClose={() => setEditingHedge(null)}
          initialData={editingHedge}
        />
      )}
    </div>
  );
}
