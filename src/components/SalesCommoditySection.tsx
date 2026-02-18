import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { SaleEntryForm } from './SaleEntryForm';
import type { CropType } from '../lib/database.types';

interface Sale {
  id: string;
  sale_date: string;
  delivery_month: string;
  destination: string;
  bushels_sold: number;
  price_per_bushel: number;
  total_revenue: number;
  notes: string | null;
}

interface SalesCommoditySectionProps {
  cropType: CropType;
  sales: Sale[];
  onAddSale: (cropType: CropType, data: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string;
  }) => Promise<void>;
  onUpdateSale: (saleId: string, data: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string;
  }) => Promise<void>;
  onDeleteSale: (saleId: string) => Promise<void>;
}

const cropConfig: Record<CropType, {
  label: string;
  headerBg: string;
  headerText: string;
  headerBorder: string;
  summaryBg: string;
  summaryBorder: string;
  summaryText: string;
  summaryValue: string;
}> = {
  corn: {
    label: 'Corn',
    headerBg: 'bg-yellow-100',
    headerText: 'text-yellow-800',
    headerBorder: 'border-yellow-200',
    summaryBg: 'bg-gradient-to-br from-yellow-50 to-yellow-100',
    summaryBorder: 'border-yellow-200',
    summaryText: 'text-yellow-800',
    summaryValue: 'text-yellow-900',
  },
  soybeans: {
    label: 'Soybeans',
    headerBg: 'bg-green-100',
    headerText: 'text-green-800',
    headerBorder: 'border-green-200',
    summaryBg: 'bg-gradient-to-br from-green-50 to-green-100',
    summaryBorder: 'border-green-200',
    summaryText: 'text-green-800',
    summaryValue: 'text-green-900',
  },
  wheat: {
    label: 'Wheat',
    headerBg: 'bg-amber-100',
    headerText: 'text-amber-800',
    headerBorder: 'border-amber-200',
    summaryBg: 'bg-gradient-to-br from-amber-50 to-amber-100',
    summaryBorder: 'border-amber-200',
    summaryText: 'text-amber-800',
    summaryValue: 'text-amber-900',
  },
};

function formatDeliveryMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBushels(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function SalesCommoditySection({
  cropType,
  sales,
  onAddSale,
  onUpdateSale,
  onDeleteSale,
}: SalesCommoditySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const config = cropConfig[cropType];

  const totalBushels = sales.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
  const weightedAvgPrice = totalBushels > 0
    ? sales.reduce((sum, s) => sum + Number(s.bushels_sold) * Number(s.price_per_bushel), 0) / totalBushels
    : 0;

  const handleAdd = async (data: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string;
  }) => {
    await onAddSale(cropType, data);
    setShowAddForm(false);
  };

  const handleUpdate = async (data: {
    sale_date: string;
    delivery_month: string;
    destination: string;
    bushels_sold: number;
    price_per_bushel: number;
    notes: string;
  }) => {
    if (!editingSale) return;
    await onUpdateSale(editingSale.id, data);
    setEditingSale(null);
  };

  const handleDelete = async (saleId: string) => {
    if (!window.confirm('Are you sure you want to delete this sale?')) return;
    await onDeleteSale(saleId);
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
            <span>{sales.length} sale{sales.length !== 1 ? 's' : ''}</span>
            {totalBushels > 0 && (
              <>
                <span>{formatBushels(totalBushels)} bu</span>
                <span>Avg {formatCurrency(weightedAvgPrice)}/bu</span>
                <span>{formatCurrency(totalRevenue)} total</span>
              </>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {expanded && (
        <div className="p-6">
          {sales.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Total Bushels Sold</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>{formatBushels(totalBushels)}</div>
              </div>
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Weighted Avg Price</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>{formatCurrency(weightedAvgPrice)}</div>
                <div className={`text-xs ${config.summaryText} opacity-75`}>per bushel</div>
              </div>
              <div className={`${config.summaryBg} rounded-lg p-4 border ${config.summaryBorder}`}>
                <div className={`text-sm font-medium ${config.summaryText} mb-1`}>Total Sales Revenue</div>
                <div className={`text-2xl font-bold ${config.summaryValue}`}>{formatCurrency(totalRevenue)}</div>
              </div>
            </div>
          )}

          {sales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Sale Date</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Delivery</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Destination</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Bushels</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Price/Bu</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Revenue</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-gray-900">{formatDate(sale.sale_date)}</td>
                      <td className="py-3 px-3 text-gray-700">{formatDeliveryMonth(sale.delivery_month)}</td>
                      <td className="py-3 px-3 text-gray-700">{sale.destination || '-'}</td>
                      <td className="py-3 px-3 text-right text-gray-900 font-medium">{formatBushels(sale.bushels_sold)}</td>
                      <td className="py-3 px-3 text-right text-gray-900">{formatCurrency(sale.price_per_bushel)}</td>
                      <td className="py-3 px-3 text-right text-gray-900 font-semibold">{formatCurrency(sale.total_revenue)}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingSale(sale)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit sale"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(sale.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete sale"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No {config.label.toLowerCase()} sales recorded yet
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add {config.label} Sale
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <SaleEntryForm
          cropType={cropType}
          onSave={handleAdd}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {editingSale && (
        <SaleEntryForm
          cropType={cropType}
          onSave={handleUpdate}
          onClose={() => setEditingSale(null)}
          initialData={editingSale}
        />
      )}
    </div>
  );
}
