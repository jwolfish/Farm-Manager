import { useEffect, useState } from 'react';
import { AlertTriangle, Sprout } from 'lucide-react';
import { ReportCard } from '../../../components/reports/ReportCard';
import { exportTableToCSV, exportSeedBagRequirementsPDF } from '../../../lib/exportUtils';
import { supabase } from '../../../lib/supabase';
import { CropType } from '../../../lib/database.types';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<CropType, { bg: string; text: string; badge: string; badgeText: string }> = {
  corn: { bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100', badgeText: 'text-amber-700' },
  soybeans: { bg: 'bg-green-50', text: 'text-green-800', badge: 'bg-green-100', badgeText: 'text-green-700' },
  wheat: { bg: 'bg-orange-50', text: 'text-orange-800', badge: 'bg-orange-100', badgeText: 'text-orange-700' },
};

interface FieldSeedRow {
  fieldId: string;
  fieldName: string;
  cropType: CropType;
  acreage: number;
  hybridName: string | null;
  seedingRate: number | null;
  unitsPerBag: number | null;
  bagsNeeded: number | null;
}

interface Props {
  currentSeasonId: string | null;
  effectiveUserId: string | null;
}

function fmtNum(n: number, decimals = 1) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function SeedBagRequirements({ currentSeasonId, effectiveUserId }: Props) {
  const [rows, setRows] = useState<FieldSeedRow[]>([]);
  const [seasonName, setSeasonName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'field' | 'crop' | 'hybrid'>('field');

  useEffect(() => {
    if (!currentSeasonId || !effectiveUserId) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);

      const [seasonRes, fieldsRes] = await Promise.all([
        supabase.from('seasons').select('name, year').eq('id', currentSeasonId).maybeSingle(),
        supabase.from('fields').select(`
          id,
          name,
          crop_type,
          acreage,
          field_costs (
            seed_variety_id,
            seeding_rate_override,
            seed_varieties (
              product_name,
              standard_seeding_rate,
              units_per_bag
            )
          )
        `)
        .eq('season_id', currentSeasonId)
        .eq('user_id', effectiveUserId)
        .order('name'),
      ]);

      if (seasonRes.data) {
        setSeasonName(`${seasonRes.data.name} (${seasonRes.data.year})`);
      }

      const fields = fieldsRes.data;
      const fieldsErr = fieldsRes.error;

      if (fieldsErr) {
        setError('Failed to load field data.');
        setLoading(false);
        return;
      }

      const built: FieldSeedRow[] = (fields ?? []).map((f: any) => {
        const fc = Array.isArray(f.field_costs) ? (f.field_costs[0] ?? null) : (f.field_costs ?? null);
        const sv = Array.isArray(fc?.seed_varieties) ? (fc.seed_varieties[0] ?? null) : (fc?.seed_varieties ?? null);
        const seedingRate: number | null =
          fc?.seeding_rate_override != null
            ? Number(fc.seeding_rate_override)
            : sv?.standard_seeding_rate != null
            ? Number(sv.standard_seeding_rate)
            : null;
        const unitsPerBag: number | null = sv?.units_per_bag != null ? Number(sv.units_per_bag) : null;
        const acreage = Number(f.acreage);
        const bagsNeeded =
          seedingRate != null && unitsPerBag != null && unitsPerBag > 0
            ? Math.ceil((acreage * seedingRate) / unitsPerBag)
            : null;

        return {
          fieldId: f.id,
          fieldName: f.name,
          cropType: f.crop_type as CropType,
          acreage,
          hybridName: sv?.product_name ?? null,
          seedingRate,
          unitsPerBag,
          bagsNeeded,
        };
      });

      setRows(built);
      setLoading(false);
    }

    load();
  }, [currentSeasonId, effectiveUserId]);

  const availableCrops = [...new Set(rows.map((r) => r.cropType))] as CropType[];
  const incompleteCount = rows.filter((r) => !r.hybridName).length;

  const filtered = rows.filter((r) => cropFilter === 'all' || r.cropType === cropFilter);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'crop') {
      return a.cropType.localeCompare(b.cropType) || a.fieldName.localeCompare(b.fieldName);
    }
    if (sortBy === 'hybrid') {
      const ha = a.hybridName ?? '';
      const hb = b.hybridName ?? '';
      return ha.localeCompare(hb) || a.fieldName.localeCompare(b.fieldName);
    }
    return a.fieldName.localeCompare(b.fieldName);
  });

  // Summary: total bags by hybrid across filtered rows
  const hybridTotals = new Map<string, { hybridName: string; cropType: CropType; totalBags: number; totalAcres: number; fieldCount: number }>();
  for (const r of sorted) {
    if (!r.hybridName || r.bagsNeeded == null) continue;
    const key = r.hybridName;
    const existing = hybridTotals.get(key);
    if (existing) {
      existing.totalBags += r.bagsNeeded;
      existing.totalAcres += r.acreage;
      existing.fieldCount += 1;
    } else {
      hybridTotals.set(key, {
        hybridName: r.hybridName,
        cropType: r.cropType,
        totalBags: r.bagsNeeded,
        totalAcres: r.acreage,
        fieldCount: 1,
      });
    }
  }

  const handleExportCSV = () => {
    const headers = ['Field', 'Crop', 'Acres', 'Hybrid', 'Seeding Rate', 'Bags Needed'];
    const csvRows = sorted.map((r) => [
      r.fieldName,
      CROP_LABELS[r.cropType],
      r.acreage.toFixed(1),
      r.hybridName ?? 'Not assigned',
      r.seedingRate != null ? r.seedingRate.toLocaleString() : '-',
      r.bagsNeeded != null ? r.bagsNeeded : '-',
    ]);
    exportTableToCSV('seed-bag-requirements', headers, csvRows);
  };

  const handleExportPDF = () => {
    exportSeedBagRequirementsPDF(
      sorted,
      [...hybridTotals.values()],
      seasonName
    );
  };

  if (!currentSeasonId) {
    return (
      <ReportCard title="Seed Bag Requirements" description="Bags of seed needed per field based on the current planting plan">
        <div className="text-center py-12 text-gray-400">No active season selected.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Seed Bag Requirements"
      description="Bags of seed needed per field based on the current planting plan"
      loading={loading}
      error={error}
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      {/* Incomplete warning */}
      {incompleteCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">{incompleteCount} field{incompleteCount !== 1 ? 's' : ''}</span> {incompleteCount === 1 ? 'has' : 'have'} no seed variety assigned and will not appear in bag totals.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Sprout className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No fields found for the active season.</p>
        </div>
      ) : (
        <>
          {/* Summary cards by hybrid */}
          {hybridTotals.size > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Seed Order Summary</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...hybridTotals.values()].map((h) => {
                  const colors = CROP_COLORS[h.cropType];
                  return (
                    <div key={h.hybridName} className={`${colors.bg} rounded-xl px-4 py-3`}>
                      <p className={`text-xs font-medium ${colors.text} opacity-70 mb-0.5`}>{CROP_LABELS[h.cropType]}</p>
                      <p className={`font-semibold text-sm ${colors.text} leading-snug`}>{h.hybridName}</p>
                      <p className={`text-2xl font-bold ${colors.text} mt-1`}>{h.totalBags} <span className="text-base font-medium">bags</span></p>
                      <p className={`text-xs ${colors.text} opacity-60 mt-0.5`}>{h.fieldCount} field{h.fieldCount !== 1 ? 's' : ''} · {fmtNum(h.totalAcres)} ac</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Crop Type</label>
              <select
                value={cropFilter}
                onChange={(e) => setCropFilter(e.target.value as CropType | 'all')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Crops</option>
                {availableCrops.map((c) => (
                  <option key={c} value={c}>{CROP_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'field' | 'crop' | 'hybrid')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="field">Field Name</option>
                <option value="crop">Crop Type</option>
                <option value="hybrid">Hybrid Name</option>
              </select>
            </div>
          </div>

          {/* Field table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Acres</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Hybrid</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Seeding Rate</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Bags Needed</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const colors = CROP_COLORS[r.cropType];
                  const missing = !r.hybridName;
                  return (
                    <tr key={r.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{r.fieldName}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge} ${colors.badgeText}`}>
                          {CROP_LABELS[r.cropType]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{fmtNum(r.acreage)}</td>
                      <td className="py-2.5 px-3">
                        {missing ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Not assigned
                          </span>
                        ) : (
                          <span className="text-gray-900">{r.hybridName}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">
                        {r.seedingRate != null ? r.seedingRate.toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.bagsNeeded != null ? (
                          <span className="font-bold text-gray-900">{r.bagsNeeded}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {sorted.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100">
                    <td className="py-2.5 px-3 font-semibold text-gray-700" colSpan={2}>Total</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-700">
                      {fmtNum(sorted.reduce((s, r) => s + r.acreage, 0))}
                    </td>
                    <td className="py-2.5 px-3" />
                    <td className="py-2.5 px-3" />
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                      {sorted.reduce((s, r) => s + (r.bagsNeeded ?? 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Bags are rounded up per field to ensure sufficient seed. Seeding rate units match the seed variety setup (seeds/ac for corn and soybeans, lbs/ac for wheat).
          </p>
        </>
      )}
    </ReportCard>
  );
}
