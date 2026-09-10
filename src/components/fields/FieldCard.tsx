import { Pencil, Trash2, FileText, Square, CheckSquare, ExternalLink, FlaskConical } from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '../ActionMenu';
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
  /** Opens the bulk fertilizer rate grid focused on this field's season. */
  onEditRates?: () => void;
  /** Hides every mutating action — a viewer on a shared farm. */
  readOnly?: boolean;
}

function getCropBadgeColor(crop: CropType): string {
  switch (crop) {
    case 'corn': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'soybeans': return 'bg-green-100 text-green-800 border-green-200';
    case 'wheat': return 'bg-amber-100 text-amber-800 border-amber-200';
  }
}

export function FieldCard({
  field,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onViewDetail,
  onEditRates,
  readOnly,
}: Props) {
  const statusColor = field.template_name
    ? field.has_overrides ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'
    : 'border-gray-200 bg-white';

  /*
   * U-4. This was a pencil and a bin, both unlabelled, both about 30 px, 8 px apart — the
   * least discoverable control on the page and the hardest to hit with a thumb. The menu
   * says what each action is, and `Open field` is listed even though the card is clickable,
   * because a menu that omits the main action reads as if the card has none.
   */
  const items: ActionMenuItem[] = [
    ...(onViewDetail
      ? [{
          label: 'Open field',
          icon: <ExternalLink className="h-4 w-4" />,
          onSelect: () => onViewDetail(field.id),
        }]
      : []),
    ...(readOnly
      ? []
      : [
          {
            label: 'Edit details',
            icon: <Pencil className="h-4 w-4" />,
            onSelect: () => onEdit(field),
          },
          ...(onEditRates
            ? [{
                label: 'Fertilizer rates',
                icon: <FlaskConical className="h-4 w-4" />,
                onSelect: onEditRates,
              }]
            : []),
          {
            label: 'Delete field',
            icon: <Trash2 className="h-4 w-4" />,
            onSelect: () => onDelete(field.id),
            destructive: true,
          },
        ]),
  ];

  return (
    /* `relative` anchors the desktop popover; `overflow-visible` lets it escape the card. */
    <div
      className={`relative overflow-visible rounded-lg shadow-sm border-2 p-4 sm:p-5 transition-all ${statusColor} ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={() => onSelect(field.id)}
          aria-label={isSelected ? `Deselect ${field.name}` : `Select ${field.name}`}
          /* -m-3 p-3 keeps the icon's visual size while giving it a 44px target. Written as
             p-2 first, which measured 36 — the same miss as the menu trigger, found the
             same way. */
          className="-m-3 shrink-0 p-3"
        >
          {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
        </button>
        <div className="flex-1 min-w-0">
          {/*
            The WHOLE title block opens the field, not just the words. "Edit programs by
            clicking on the field name" was the complaint; a bigger target does not make it
            discoverable on its own, which is what `Open field` in the menu is for.
          */}
          <button
            onClick={() => onViewDetail?.(field.id)}
            className="group w-full text-left"
            disabled={!onViewDetail}
          >
            <h3 className="font-semibold text-gray-900 text-lg break-words transition-colors group-hover:text-blue-600">
              {field.name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{field.acreage} acres</p>
          </button>
        </div>
        {items.length > 0 && (
          <div className="relative shrink-0">
            <ActionMenu items={items} label={`Actions for ${field.name}`} sheetTitle={field.name} />
          </div>
        )}
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
        <div className="flex items-center gap-2 text-sm mb-2 min-w-0">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-gray-700 truncate">{field.template_name}</span>
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

      {field.notes && <p className="mt-3 text-sm text-gray-600 border-t pt-3 break-words">{field.notes}</p>}
    </div>
  );
}
