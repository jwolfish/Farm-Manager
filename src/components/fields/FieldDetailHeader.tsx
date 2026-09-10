import { Sprout, Pencil } from 'lucide-react';
import type { CropType } from '../../lib/database.types';

/**
 * The field page's header — extracted for MOB-3, presentation only.
 *
 * `FieldDetail.tsx` carried 432 lines with ZERO responsive classes and imports the Supabase
 * client at module load, so none of it could be rendered on a machine with no credentials.
 * This is the same cut `AppFullScreens` made for the five full-screen blocks, and for the
 * same reason: the screens in this project that have been looked at are the ones that got
 * split, and eight of the last eleven rounds found a defect the moment one was.
 *
 * The old layout was `flex items-start justify-between` with the field name on the left and
 * a four-line cost block on the right. At 375 px those two fight for about 170 px each.
 */

interface Props {
  name: string;
  cropType: CropType;
  acreage: number;
  notes: string | null;
  operationalCostPerAcre: number;
  landCostPerAcre: number;
  totalForField: number;
  /** U-3 — opens the shared field-details editor. Omitted for a viewer. */
  onEdit?: () => void;
}

export function FieldDetailHeader({
  name,
  cropType,
  acreage,
  notes,
  operationalCostPerAcre,
  landCostPerAcre,
  totalForField,
  onEdit,
}: Props) {
  const perAcre = operationalCostPerAcre + landCostPerAcre;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
      {/* Stacks on a phone; the two columns only exist once there is room for them. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words min-w-0">{name}</h1>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit field details"
                /* p-3 on a w-5 icon measures 44px — with the h-4 icon it was 40. It sits
                   beside the title rather than in the corner, because the corner is where
                   the cost block goes on desktop. */
                className="-m-1 shrink-0 rounded-lg p-3 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600">
            <div className="flex items-center gap-1">
              <Sprout className="w-4 h-4" />
              <span className="capitalize">{cropType}</span>
            </div>
            <div>{acreage} acres</div>
          </div>
          {notes && <p className="text-sm text-gray-600 mt-2 break-words">{notes}</p>}
        </div>

        <div className="shrink-0 border-t border-gray-100 pt-3 sm:border-0 sm:pt-0 sm:text-right">
          <div className="text-sm text-gray-600">Total Cost Per Acre</div>
          <div className="text-3xl font-bold text-green-600">${perAcre.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">
            Operational: ${operationalCostPerAcre.toFixed(2)} + Land: ${landCostPerAcre.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600 mt-1">${totalForField.toFixed(2)} total for field</div>
        </div>
      </div>
    </div>
  );
}
