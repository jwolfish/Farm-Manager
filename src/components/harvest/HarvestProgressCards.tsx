import { AlertCircle, Droplets, TrendingDown, TrendingUp } from 'lucide-react';
import type { CropHarvestProgress } from '../../lib/harvestProgress';
import type { CropType } from '../../lib/database.types';

/**
 * The progress block — H-4. One card per crop, and no season total anywhere on it.
 *
 * Presentation only, no Supabase import, so it can be rendered with fixtures.
 *
 * The bar measures ACRES. The field counts sit beside it as text, where they are honest —
 * twelve of thirty fields can be a fifth of the crop, and a bar drawn from the field count
 * would be the more flattering of the two numbers roughly whenever the big fields are still
 * standing.
 */

const CROP_LABEL: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_BAR: Record<string, string> = {
  corn: 'bg-amber-500',
  soybeans: 'bg-emerald-600',
  wheat: 'bg-yellow-600',
};

function label(crop: CropType): string {
  return CROP_LABEL[crop] ?? crop;
}

function bu(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ac(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value % 1 === 0 ? 0 : 1 });
}

export function HarvestProgressCards({ progress }: { progress: CropHarvestProgress[] }) {
  if (progress.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {progress.map(crop => (
        <CropCard key={crop.cropType} crop={crop} />
      ))}
    </div>
  );
}

function CropCard({ crop }: { crop: CropHarvestProgress }) {
  const percent = Math.round(crop.fractionHarvested * 100);
  const done = crop.acresToGo <= 0 && crop.acresTotal > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">{label(crop.cropType)}</h3>
        <span className={`text-2xl font-bold tabular-nums ${done ? 'text-emerald-600' : 'text-gray-900'}`}>
          {percent}%
        </span>
      </div>

      <div className="mt-3 h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${CROP_BAR[crop.cropType] ?? 'bg-green-600'}`}
          style={{ width: `${Math.min(100, Math.max(0, crop.fractionHarvested * 100))}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label(crop.cropType)} acres harvested`}
        />
      </div>

      <p className="mt-2 text-sm text-gray-600">
        {ac(crop.acresHarvested)} of {ac(crop.acresTotal)} acres ·{' '}
        {crop.fieldsHarvested} of {crop.fieldsHarvested + crop.fieldsToGo} fields
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <dt className="text-xs font-medium text-gray-500">In the bin</dt>
          <dd className="text-lg font-semibold text-gray-900 tabular-nums">{bu(crop.bushelsHarvested)}</dd>
          <dd className="text-xs text-gray-500">
            bushels{crop.avgYieldHarvested !== null && ` · ${crop.avgYieldHarvested.toFixed(1)} bu/ac`}
          </dd>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <dt className="text-xs font-medium text-gray-500">Estimated to go</dt>
          <dd className="text-lg font-semibold text-gray-900 tabular-nums">{bu(crop.bushelsToGo)}</dd>
          <dd className="text-xs text-gray-500">bushels · {ac(crop.acresToGo)} acres</dd>
        </div>
      </dl>

      {crop.actualVsEstimate !== null && crop.fieldsHarvested > 0 && (
        <p
          className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${
            crop.actualVsEstimate >= 0 ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {crop.actualVsEstimate >= 0 ? (
            <TrendingUp className="w-4 h-4 shrink-0" />
          ) : (
            <TrendingDown className="w-4 h-4 shrink-0" />
          )}
          <span>
            {bu(Math.abs(crop.actualVsEstimate))} bu {crop.actualVsEstimate >= 0 ? 'over' : 'under'} estimate
            <span className="font-normal text-gray-500"> on what is off</span>
          </span>
        </p>
      )}

      {crop.avgMoisture && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-600">
          <Droplets className="w-4 h-4 shrink-0 text-blue-500" />
          {crop.avgMoisture.percentage.toFixed(1)}% moisture
          <span className="text-gray-400">
            · {crop.avgMoisture.recordedOn} {crop.avgMoisture.recordedOn === 1 ? 'field' : 'fields'}
          </span>
        </p>
      )}

      {/*
        Named, never folded into the figure above. A field with no estimate contributes
        nothing to "estimated to go", and saying so is the difference between a small number
        and a wrong one.
      */}
      {crop.unestimated.count > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            <strong>
              {crop.unestimated.count} {crop.unestimated.count === 1 ? 'field' : 'fields'} ·{' '}
              {ac(crop.unestimated.acres)} acres
            </strong>{' '}
            have no estimate, so they are not in the figure above
            {crop.unestimated.fieldNames.length <= 4 && `: ${crop.unestimated.fieldNames.join(', ')}`}
          </span>
        </p>
      )}
    </div>
  );
}
