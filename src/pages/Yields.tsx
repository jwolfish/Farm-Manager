import { useState } from 'react';
import { Wheat, Save, Calendar, DollarSign, Check, AlertCircle, RefreshCw } from 'lucide-react';
import type { CropType } from '../lib/database.types';
import { useYieldEntry } from '../hooks/useYieldEntry';
import type { FieldWithYield, SaveStatus } from '../hooks/useYieldEntry';

interface YieldsProps {
  seasonId: string | null;
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'saving' && (
        <><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /><span className="text-blue-600 font-medium">Saving...</span></>
      )}
      {status === 'saved' && (
        <><Check className="w-4 h-4 text-green-600" /><span className="text-green-600 font-medium">Saved</span></>
      )}
      {status === 'error' && (
        <><AlertCircle className="w-4 h-4 text-red-600" /><span className="text-red-600 font-medium">Error saving</span></>
      )}
    </div>
  );
}

interface FieldYieldCardProps {
  field: FieldWithYield;
  saveStatus: SaveStatus;
  saving: string | null;
  onYieldChange: (fieldId: string, yieldPerAcre: number) => void;
  onFieldUpdate: (fieldId: string, updates: Record<string, unknown>) => void;
  onSave: (field: FieldWithYield) => void;
}

function FieldYieldCard({ field, saveStatus, saving, onYieldChange, onFieldUpdate, onSave }: FieldYieldCardProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{field.name}</h3>
              <p className="text-sm text-gray-600">{field.crop_type} • {field.acreage} acres</p>
            </div>
            <SaveStatusIndicator status={saveStatus} />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Yield (bushels per acre) *</label>
              <input
                type="number" step="0.1"
                value={field.yield?.yield_bushels_per_acre || ''}
                onChange={(e) => onYieldChange(field.id, parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter yield"
              />
            </div>

            {field.yield && field.yield.yield_bushels_per_acre > 0 && (
              <div className="space-y-2">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-gray-700">Total Yield: </span>
                  <span className="text-lg font-bold text-blue-700">{field.yield.total_yield_bushels.toFixed(1)} bushels</span>
                </div>
                {field.yield.gross_revenue_per_acre !== null && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-medium text-gray-700">Revenue/Acre: </span>
                    <span className="text-lg font-bold text-green-700">${field.yield.gross_revenue_per_acre.toFixed(2)}</span>
                  </div>
                )}
                {field.yield.profit_per_acre !== null && field.field_cost && (
                  <div className={`p-3 rounded-lg border ${field.yield.profit_per_acre >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Profit/Acre: </span>
                      <span className={`text-lg font-bold ${field.yield.profit_per_acre >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        ${field.yield.profit_per_acre.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Cost/Acre: ${field.field_cost.total_cost_per_acre.toFixed(2)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-4">Additional Information (Optional)</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />Harvest Date
              </label>
              <input
                type="date"
                value={field.yield?.harvest_date || ''}
                onChange={(e) => onFieldUpdate(field.id, { harvest_date: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Moisture %</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={field.yield?.moisture_percentage || ''}
                onChange={(e) => onFieldUpdate(field.id, { moisture_percentage: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., 15.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={field.yield?.notes || ''}
                onChange={(e) => onFieldUpdate(field.id, { notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Any notes about this harvest..."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => onSave(field)}
          disabled={saving === field.id || saveStatus === 'saving' || !field.yield || field.yield.yield_bushels_per_acre <= 0}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving === field.id ? 'Saving...' : 'Save Now'}
        </button>
      </div>
    </div>
  );
}

interface PriceInputProps {
  label: string;
  colorScheme: 'yellow' | 'green' | 'amber';
  cropType: CropType;
  value: string;
  loadingAvg: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onFetchAvg: () => void;
}

const colorMap = {
  yellow: { bg: 'from-yellow-50 to-yellow-100', border: 'border-yellow-200', label: 'text-yellow-800', inputBorder: 'border-yellow-300', ring: 'focus:ring-yellow-500', dollar: 'text-yellow-700', btn: 'bg-yellow-600 hover:bg-yellow-700' },
  green: { bg: 'from-green-50 to-green-100', border: 'border-green-200', label: 'text-green-800', inputBorder: 'border-green-300', ring: 'focus:ring-green-500', dollar: 'text-green-700', btn: 'bg-green-600 hover:bg-green-700' },
  amber: { bg: 'from-amber-50 to-amber-100', border: 'border-amber-200', label: 'text-amber-800', inputBorder: 'border-amber-300', ring: 'focus:ring-amber-500', dollar: 'text-amber-700', btn: 'bg-amber-600 hover:bg-amber-700' },
};

function PriceInput({ label, colorScheme, value, loadingAvg, onChange, onBlur, onFetchAvg }: PriceInputProps) {
  const c = colorMap[colorScheme];
  return (
    <div className={`bg-gradient-to-br ${c.bg} rounded-lg p-4 border ${c.border}`}>
      <label className={`block text-sm font-medium ${c.label} mb-2`}>{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className={`absolute left-3 top-2.5 ${c.dollar} font-medium`}>$</span>
          <input
            type="text" inputMode="decimal" value={value}
            onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
            className={`w-full pl-8 pr-3 py-2 border ${c.inputBorder} rounded-lg focus:ring-2 ${c.ring} focus:border-transparent bg-white`}
            placeholder="0.00"
          />
        </div>
        <button
          onClick={onFetchAvg} disabled={loadingAvg}
          className={`px-3 py-2 ${c.btn} text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5`}
          title="Use weighted average price from Sales Tracking"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAvg ? 'animate-spin' : ''}`} />
          Sales Avg
        </button>
      </div>
    </div>
  );
}

export function Yields({ seasonId }: YieldsProps) {
  const {
    fields, loading, saving, saveStatus, loadingSalesAvg, priceInputs,
    handleYieldChange, handleFieldUpdate, saveYield,
    handlePriceInputChange, handlePriceInputBlur, fetchSalesAverage,
    calculateStats,
  } = useYieldEntry(seasonId);

  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');

  const filteredFields = cropFilter === 'all' ? fields : fields.filter(f => f.crop_type === cropFilter);
  const stats = calculateStats();

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-lg text-gray-600">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wheat className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-semibold text-gray-900">Yield Entry</h2>
          </div>
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value as CropType | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="all">All Crops</option>
            <option value="corn">Corn</option>
            <option value="soybeans">Soybeans</option>
            <option value="wheat">Wheat</option>
          </select>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Season Crop Prices</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceInput label="Corn Price (per bushel)" colorScheme="yellow" cropType="corn" value={priceInputs.corn} loadingAvg={!!loadingSalesAvg.corn} onChange={(v) => handlePriceInputChange('corn', v)} onBlur={() => handlePriceInputBlur('corn')} onFetchAvg={() => fetchSalesAverage('corn')} />
            <PriceInput label="Soybeans Price (per bushel)" colorScheme="green" cropType="soybeans" value={priceInputs.soybeans} loadingAvg={!!loadingSalesAvg.soybeans} onChange={(v) => handlePriceInputChange('soybeans', v)} onBlur={() => handlePriceInputBlur('soybeans')} onFetchAvg={() => fetchSalesAverage('soybeans')} />
            <PriceInput label="Wheat Price (per bushel)" colorScheme="amber" cropType="wheat" value={priceInputs.wheat} loadingAvg={!!loadingSalesAvg.wheat} onChange={(v) => handlePriceInputChange('wheat', v)} onBlur={() => handlePriceInputBlur('wheat')} onFetchAvg={() => fetchSalesAverage('wheat')} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {([['corn', 'yellow', 'from-yellow-50 to-yellow-100', 'border-yellow-200', 'text-yellow-800', 'text-yellow-900', 'text-yellow-700'],
             ['soybeans', 'green', 'from-green-50 to-green-100', 'border-green-200', 'text-green-800', 'text-green-900', 'text-green-700'],
             ['wheat', 'amber', 'from-amber-50 to-amber-100', 'border-amber-200', 'text-amber-800', 'text-amber-900', 'text-amber-700']] as const).map(([crop, , bg, border, labelColor, valueColor, subColor]) => {
            const s = stats[crop];
            return (
              <div key={crop} className={`bg-gradient-to-br ${bg} rounded-lg p-4 border ${border}`}>
                <div className={`text-sm font-medium ${labelColor} mb-1 capitalize`}>{crop}</div>
                <div className={`text-2xl font-bold ${valueColor}`}>
                  {s.totalAcreage > 0 ? (s.totalYield / s.totalAcreage).toFixed(1) : '0.0'}
                </div>
                <div className={`text-xs ${subColor}`}>avg bu/acre ({s.count} field{s.count !== 1 ? 's' : ''})</div>
              </div>
            );
          })}
        </div>

        {filteredFields.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No fields found. Create fields first.</p>
        ) : (
          <div className="space-y-4">
            {filteredFields.map((field) => (
              <FieldYieldCard
                key={field.id}
                field={field}
                saveStatus={saveStatus[field.id] || 'idle'}
                saving={saving}
                onYieldChange={handleYieldChange}
                onFieldUpdate={handleFieldUpdate as any}
                onSave={saveYield}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
