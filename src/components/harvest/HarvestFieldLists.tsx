import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { isHarvested, totalBushels } from '../../lib/harvestProgress';
import type { HarvestField } from '../../lib/harvestProgress';
import type { CropType } from '../../lib/database.types';

/**
 * The two lists under the progress block — H-4. Presentation only.
 *
 * "To go" is open and sorted biggest-acreage-first, because that is the order fields get
 * cut in and the order the thumb wants them in. "Off" is collapsed, because it is a record
 * rather than a task, and re-opening a row is how a mistyped number gets corrected.
 *
 * The whole row is the target, not an icon on the end of it. Every one is measured, not
 * asserted — three controls in the field-editing round carried a comment claiming 44 px and
 * rendered at 40, 40 and 36.
 */

const CROP_LABEL: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

function label(crop: CropType): string {
  return CROP_LABEL[crop] ?? crop;
}

function bu(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

interface Props {
  fields: HarvestField[];
  onSelect: (field: HarvestField) => void;
  readOnly?: boolean;
}

export function HarvestFieldLists({ fields, onSelect, readOnly }: Props) {
  const toGo = fields.filter(f => !isHarvested(f.yieldRow)).sort((a, b) => b.acreage - a.acreage);
  const off = fields
    .filter(f => isHarvested(f.yieldRow))
    .sort((a, b) => (b.yieldRow?.harvestedAt ?? '').localeCompare(a.yieldRow?.harvestedAt ?? ''));

  const byCrop = new Map<CropType, HarvestField[]>();
  for (const field of toGo) {
    const list = byCrop.get(field.cropType);
    if (list) list.push(field);
    else byCrop.set(field.cropType, [field]);
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          To go{toGo.length > 0 && ` · ${toGo.length}`}
        </h2>

        {toGo.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Everything is off. That is the whole season in the bin.
          </p>
        ) : (
          <div className="space-y-5">
            {[...byCrop.entries()].map(([crop, cropFields]) => (
              <div key={crop}>
                <h3 className="text-xs font-medium text-gray-500 mb-2">
                  {label(crop)} · {cropFields.length}
                </h3>
                <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                  {cropFields.map(field => (
                    <li key={field.fieldId}>
                      <button
                        type="button"
                        onClick={() => onSelect(field)}
                        disabled={readOnly}
                        /* py-4 with two text lines is comfortably past 44px. Measured. */
                        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 disabled:opacity-60 disabled:hover:bg-white"
                      >
                        <Circle className="w-5 h-5 shrink-0 text-gray-300" />
                        <span className="min-w-0 grow">
                          <span className="block font-medium text-gray-900 truncate">{field.name}</span>
                          <span className="block text-sm text-gray-500">
                            {field.acreage} ac
                            {field.yieldRow?.estimatedYieldBushelsPerAcre != null
                              ? ` · est. ${field.yieldRow.estimatedYieldBushelsPerAcre} bu/ac`
                              : ' · no estimate'}
                          </span>
                        </span>
                        <ChevronRight className="w-5 h-5 shrink-0 text-gray-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {off.length > 0 && <HarvestedList fields={off} onSelect={onSelect} readOnly={readOnly} />}
    </div>
  );
}

function HarvestedList({ fields, onSelect, readOnly }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Off · {fields.length}
      </button>

      {open && (
        <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
          {fields.map(field => (
            <li key={field.fieldId}>
              <button
                type="button"
                onClick={() => onSelect(field)}
                disabled={readOnly}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 disabled:opacity-60 disabled:hover:bg-white"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 grow">
                  <span className="block font-medium text-gray-900 truncate">{field.name}</span>
                  <span className="block text-sm text-gray-500">
                    {field.yieldRow?.harvestDate ?? 'no date'} ·{' '}
                    {field.yieldRow?.yieldBushelsPerAcre ?? 0} bu/ac
                    {field.yieldRow?.moisturePercentage != null &&
                      ` · ${field.yieldRow.moisturePercentage}%`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-gray-700 tabular-nums">
                  {bu(totalBushels(field.yieldRow?.yieldBushelsPerAcre ?? 0, field.acreage))} bu
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
