import { CreditCard as Edit2, Trash2, FileText, Square, CheckSquare } from 'lucide-react';
import type { CropType } from '../../lib/database.types';

export interface FieldWithCosts {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  land_rent_per_acre: number;
  property_tax_per_acre: number;
  notes: string | null;
  template_name: string | null;
  total_cost_per_acre: number | null;
  has_overrides: boolean;
}

interface Props {
  field: FieldWithCosts;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (field: FieldWithCosts) => void;
  onDelete: (id: string) => void;
  onViewDetail?: (id: string) => void;
}

function getCropBadgeColor(crop: CropType): string {
  switch (crop) {
    case 'corn': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'soybeans': return 'bg-green-100 text-green-800 border-green-200';
    case 'wheat': return 'bg-amber-100 text-amber-800 border-amber-200';
  }
}

export function FieldCard({ field, isSelected, onSelect, onEdit, onDelete, onViewDetail }: Props) {
  const statusColor = field.template_name
    ? field.has_overrides ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'
    : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-lg shadow-sm border-2 p-5 transition-all ${statusColor} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        <button onClick={() => onSelect(field.id)} className="mt-1 flex-shrink-0">
          {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => onViewDetail?.(field.id)} className="text-left w-full">
            <h3 className="font-semibold text-gray-900 text-lg hover:text-blue-600 transition-colors">{field.name}</h3>
          </button>
          <p className="text-sm text-gray-600 mt-1">{field.acreage} acres</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => onEdit(field)} className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(field.id)} className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getCropBadgeColor(field.crop_type)}`}>
          {field.crop_type.charAt(0).toUpperCase() + field.crop_type.slice(1)}
        </div>
        {field.has_overrides && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Custom</span>
        )}
      </div>

      {field.template_name ? (
        <div className="flex items-center gap-2 text-sm mb-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <span className="text-gray-700">{field.template_name}</span>
        </div>
      ) : (
        <div className="text-sm text-gray-500 mb-2">No template</div>
      )}

      <div className="space-y-1">
        {field.total_cost_per_acre !== null && (
          <div className="text-lg font-semibold text-green-600">
            ${field.total_cost_per_acre.toFixed(2)}/acre
            <span className="text-xs text-gray-500 ml-1 font-normal">(operational)</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-600">Rent: </span><span className="font-medium text-gray-900">${field.land_rent_per_acre.toFixed(2)}/ac</span></div>
          <div><span className="text-gray-600">Tax: </span><span className="font-medium text-gray-900">${field.property_tax_per_acre.toFixed(2)}/ac</span></div>
        </div>
        {field.total_cost_per_acre !== null && (
          <div className="text-sm text-gray-700 pt-1 border-t">
            <span className="text-gray-600">Total: </span>
            <span className="font-semibold text-gray-900">
              ${(field.total_cost_per_acre + field.land_rent_per_acre + field.property_tax_per_acre).toFixed(2)}/acre
            </span>
          </div>
        )}
      </div>

      {field.notes && <p className="mt-3 text-sm text-gray-600 border-t pt-3">{field.notes}</p>}
    </div>
  );
}
