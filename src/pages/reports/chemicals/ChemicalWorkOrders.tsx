import { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { ReportCard } from '../../../components/reports/ReportCard';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportChemicalWorkOrdersPDF } from '../../../lib/exportUtils';
import { supabase } from '../../../lib/supabase';
import { toBestPracticalUnit } from '../../../lib/unitConversions';
import { CropType } from '../../../lib/database.types';
import { ProgramReference } from '../../../lib/templateUtils';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<CropType, { section: string; badge: string; badgeText: string; border: string; header: string }> = {
  corn:     { section: 'bg-amber-50',  badge: 'bg-amber-100',  badgeText: 'text-amber-800',  border: 'border-amber-200', header: 'text-amber-800' },
  soybeans: { section: 'bg-green-50',  badge: 'bg-green-100',  badgeText: 'text-green-800',  border: 'border-green-200', header: 'text-green-800' },
  wheat:    { section: 'bg-orange-50', badge: 'bg-orange-100', badgeText: 'text-orange-800', border: 'border-orange-200', header: 'text-orange-800' },
};

interface ChemLine {
  chemicalId: string;
  chemicalName: string;
  ratePerAcre: number;
  rateUnit: string;
}

interface FieldEntry {
  fieldId: string;
  fieldName: string;
  acreage: number;
  chemicals: Array<ChemLine & { totalDisplay: string; totalValue: number; totalUnit: string }>;
}

interface WorkOrderCard {
  programId: string;
  programName: string;
  cropType: CropType;
  applicationCostPerAcre: number;
  totalAcres: number;
  fields: FieldEntry[];
  // Per-chemical totals across all fields in this card
  chemTotals: Array<{ chemicalId: string; chemicalName: string; ratePerAcre: number; rateUnit: string; totalDisplay: string; totalValue: number; totalUnit: string }>;
}

interface NoProgField {
  fieldId: string;
  fieldName: string;
  cropType: CropType;
}

interface Props {
  currentSeasonId: string | null;
  effectiveUserId: string | null;
}

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function ChemicalWorkOrders({ currentSeasonId, effectiveUserId }: Props) {
  const [cards, setCards] = useState<WorkOrderCard[]>([]);
  const [noProgFields, setNoProgFields] = useState<NoProgField[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentSeasonId || !effectiveUserId) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch season name + fields with field_costs (template_id)
        const [seasonRes, fieldsRes] = await Promise.all([
          supabase.from('seasons').select('name, year').eq('id', currentSeasonId!).maybeSingle(),
          supabase.from('fields').select(`
            id, name, crop_type, acreage,
            field_costs ( template_id )
          `)
            .eq('season_id', currentSeasonId!)
            .eq('user_id', effectiveUserId!)
            .order('name'),
        ]);

        if (seasonRes.data) {
          setSeasonName(`${seasonRes.data.name} (${seasonRes.data.year})`);
        }
        if (fieldsRes.error) throw fieldsRes.error;

        const fields = fieldsRes.data ?? [];
        if (fields.length === 0) {
          setCards([]);
          setNoProgFields([]);
          setLoading(false);
          return;
        }

        // 2. Collect template ids and field ids
        const fieldIds = fields.map((f: any) => f.id);
        const templateIds = [
          ...new Set(
            fields
              .map((f: any) => {
                const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
                return fc?.template_id as string | null;
              })
              .filter(Boolean) as string[]
          ),
        ];

        // 3. Fetch overrides and templates in parallel
        const [overridesRes, templatesRes] = await Promise.all([
          supabase
            .from('field_cost_overrides')
            .select('field_id, cost_item_name, override_value')
            .in('field_id', fieldIds)
            .eq('cost_item_name', 'chemical_programs'),
          templateIds.length > 0
            ? supabase.from('cost_templates').select('id, chemical_programs').in('id', templateIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (overridesRes.error) throw overridesRes.error;
        if (templatesRes.error) throw templatesRes.error;

        const overrideMap = new Map<string, ProgramReference[]>();
        for (const o of overridesRes.data ?? []) {
          overrideMap.set(o.field_id, o.override_value as ProgramReference[]);
        }

        const templateMap = new Map<string, ProgramReference[]>();
        for (const t of templatesRes.data ?? []) {
          templateMap.set(t.id, (t.chemical_programs as ProgramReference[]) ?? []);
        }

        // 4. Resolve program refs per field
        const fieldProgramRefs = new Map<string, ProgramReference[]>();
        for (const f of fields as any[]) {
          const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
          const templateId: string | null = fc?.template_id ?? null;
          const override = overrideMap.get(f.id);
          const fromTemplate = templateId ? (templateMap.get(templateId) ?? []) : [];
          fieldProgramRefs.set(f.id, override ?? fromTemplate);
        }

        // 5. Collect all program ids to fetch
        const allProgramIds = [
          ...new Set(
            [...fieldProgramRefs.values()].flatMap((refs) => refs.map((r) => r.program_id))
          ),
        ];

        if (allProgramIds.length === 0) {
          setCards([]);
          setNoProgFields(
            (fields as any[]).map((f) => ({ fieldId: f.id, fieldName: f.name, cropType: f.crop_type as CropType }))
          );
          setLoading(false);
          return;
        }

        // 6. Fetch chemical programs with items + chemicals
        const progsRes = await supabase
          .from('chemical_programs')
          .select(`
            id, program_name, crop_type, application_cost,
            chemical_program_items (
              id, application_rate, application_rate_unit,
              individual_chemicals ( id, chemical_name, unit_type )
            )
          `)
          .in('id', allProgramIds);

        if (progsRes.error) throw progsRes.error;

        const programMap = new Map<string, any>();
        for (const p of progsRes.data ?? []) {
          programMap.set(p.id, p);
        }

        // 7. Build work order cards grouped by programId → crop type
        // Map: programId → { fields: FieldEntry[], program data }
        const cardMap = new Map<string, { program: any; fields: FieldEntry[] }>();

        const unassignedFields: NoProgField[] = [];

        for (const f of fields as any[]) {
          const refs = fieldProgramRefs.get(f.id) ?? [];
          if (refs.length === 0) {
            unassignedFields.push({ fieldId: f.id, fieldName: f.name, cropType: f.crop_type as CropType });
            continue;
          }

          for (const ref of refs) {
            const program = programMap.get(ref.program_id);
            if (!program) continue;

            const items = Array.isArray(program.chemical_program_items) ? program.chemical_program_items : [];
            const acreage = Number(f.acreage);

            const fieldChems = items.map((item: any) => {
              const chem = Array.isArray(item.individual_chemicals)
                ? item.individual_chemicals[0]
                : item.individual_chemicals;
              const rate = Number(item.application_rate);
              const rateUnit: string = item.application_rate_unit ?? chem?.unit_type ?? '';
              const totalRaw = rate * acreage;
              const practical = toBestPracticalUnit(totalRaw, rateUnit);
              return {
                chemicalId: chem?.id ?? item.id,
                chemicalName: chem?.chemical_name ?? 'Unknown',
                ratePerAcre: rate,
                rateUnit,
                totalDisplay: practical.display,
                totalValue: practical.value,
                totalUnit: practical.unit,
              };
            });

            const fieldEntry: FieldEntry = {
              fieldId: f.id,
              fieldName: f.name,
              acreage,
              chemicals: fieldChems,
            };

            if (!cardMap.has(ref.program_id)) {
              cardMap.set(ref.program_id, { program, fields: [] });
            }
            cardMap.get(ref.program_id)!.fields.push(fieldEntry);
          }
        }

        // 8. Convert cardMap to WorkOrderCard[]
        const built: WorkOrderCard[] = [];
        for (const [programId, { program, fields: cardFields }] of cardMap) {
          const totalAcres = cardFields.reduce((s, f) => s + f.acreage, 0);

          // Aggregate per-chemical totals in fl oz / oz then convert
          const chemTotalMap = new Map<string, { chemicalId: string; chemicalName: string; ratePerAcre: number; rateUnit: string; totalRaw: number }>();
          for (const fe of cardFields) {
            for (const ch of fe.chemicals) {
              const key = ch.chemicalId;
              const existing = chemTotalMap.get(key);
              // Accumulate in the rate unit (raw)
              const rawTotal = ch.ratePerAcre * fe.acreage;
              if (existing) {
                existing.totalRaw += rawTotal;
              } else {
                chemTotalMap.set(key, {
                  chemicalId: ch.chemicalId,
                  chemicalName: ch.chemicalName,
                  ratePerAcre: ch.ratePerAcre,
                  rateUnit: ch.rateUnit,
                  totalRaw: rawTotal,
                });
              }
            }
          }

          const chemTotals = [...chemTotalMap.values()].map((ct) => {
            const practical = toBestPracticalUnit(ct.totalRaw, ct.rateUnit);
            return {
              chemicalId: ct.chemicalId,
              chemicalName: ct.chemicalName,
              ratePerAcre: ct.ratePerAcre,
              rateUnit: ct.rateUnit,
              totalDisplay: practical.display,
              totalValue: practical.value,
              totalUnit: practical.unit,
            };
          });

          built.push({
            programId,
            programName: program.program_name,
            cropType: program.crop_type as CropType,
            applicationCostPerAcre: Number(program.application_cost ?? 0),
            totalAcres,
            fields: cardFields,
            chemTotals,
          });
        }

        // Sort: by crop type then program name
        built.sort((a, b) => {
          const cropOrder = { corn: 0, soybeans: 1, wheat: 2 };
          const co = (cropOrder[a.cropType] ?? 99) - (cropOrder[b.cropType] ?? 99);
          if (co !== 0) return co;
          return a.programName.localeCompare(b.programName);
        });

        setCards(built);
        setNoProgFields(unassignedFields);
      } catch (err: any) {
        setError('Failed to load chemical work order data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [currentSeasonId, effectiveUserId]);

  const filteredCards = cards.filter((c) => cropFilter === 'all' || c.cropType === cropFilter);
  const availableCrops = [...new Set(cards.map((c) => c.cropType))] as CropType[];

  const toggleCard = (programId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  };

  const handleExportCSV = () => {
    const headers = ['Crop Type', 'Program', 'Field', 'Acres', 'Chemical', 'Rate / Acre', 'Rate Unit', 'Total Needed'];
    const csvRows: (string | number)[][] = [];
    for (const card of filteredCards) {
      for (const fe of card.fields) {
        for (const ch of fe.chemicals) {
          csvRows.push([
            CROP_LABELS[card.cropType],
            card.programName,
            fe.fieldName,
            fe.acreage.toFixed(1),
            ch.chemicalName,
            ch.ratePerAcre,
            ch.rateUnit,
            ch.totalDisplay,
          ]);
        }
      }
    }
    exportTableToCSV('chemical-work-orders', headers, csvRows);
  };

  const handleExportPDF = () => {
    exportChemicalWorkOrdersPDF(filteredCards, seasonName);
  };

  if (!currentSeasonId) {
    return (
      <ReportCard title="Chemical Work Orders" description="Per-field spray mix quantities for each chemical program">
        <div className="text-center py-12 text-gray-400">No active season selected.</div>
      </ReportCard>
    );
  }

  // Group filtered cards by crop type for rendering
  const cropGroups = new Map<CropType, WorkOrderCard[]>();
  for (const card of filteredCards) {
    if (!cropGroups.has(card.cropType)) cropGroups.set(card.cropType, []);
    cropGroups.get(card.cropType)!.push(card);
  }

  return (
    <ReportCard
      title="Chemical Work Orders"
      description="Per-field spray mix quantities for each chemical program"
      loading={loading}
      error={error}
      onExportCSV={filteredCards.length > 0 ? handleExportCSV : undefined}
      onExportPDF={filteredCards.length > 0 ? handleExportPDF : undefined}
    >
      {/* No-program warning */}
      {noProgFields.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">{noProgFields.length} field{noProgFields.length !== 1 ? 's' : ''}</span>{' '}
            {noProgFields.length === 1 ? 'has' : 'have'} no chemical program assigned:{' '}
            {noProgFields.map((f) => f.fieldName).join(', ')}.
          </span>
        </div>
      )}

      {cards.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No chemical programs assigned to fields this season.</p>
        </div>
      ) : (
        <>
          {/* Crop filter */}
          {availableCrops.length > 1 && (
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by Crop</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCropFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    cropFilter === 'all'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  All Crops
                </button>
                {availableCrops.map((c) => {
                  const col = CROP_COLORS[c];
                  const active = cropFilter === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setCropFilter(c)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active ? `${col.badge} ${col.badgeText} ${col.border}` : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {CROP_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cards grouped by crop type */}
          <div className="space-y-8">
            {[...cropGroups.entries()].map(([cropType, cropCards]) => {
              const col = CROP_COLORS[cropType];
              return (
                <div key={cropType}>
                  {/* Crop section header */}
                  <div className={`flex items-center gap-3 mb-4`}>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${col.badge} ${col.badgeText}`}>
                      {CROP_LABELS[cropType]}
                    </span>
                    <div className={`flex-1 border-t ${col.border}`} />
                    <span className="text-xs text-gray-400">
                      {cropCards.length} program{cropCards.length !== 1 ? 's' : ''} · {fmtAcres(cropCards.reduce((s, c) => s + c.totalAcres, 0))} total ac
                    </span>
                  </div>

                  <div className="space-y-4">
                    {cropCards.map((card) => {
                      const expanded = expandedCards.has(card.programId);
                      return (
                        <div key={card.programId} className={`border ${col.border} rounded-xl overflow-hidden`}>
                          {/* Card header */}
                          <div className={`${col.section} px-5 py-4`}>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h4 className={`font-bold text-base ${col.header}`}>{card.programName}</h4>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {card.fields.map((fe) => (
                                    <span
                                      key={fe.fieldId}
                                      className="inline-block bg-white/70 border border-white/80 rounded-md px-2 py-0.5 text-xs font-medium text-gray-700"
                                    >
                                      {fe.fieldName} <span className="text-gray-400">({fmtAcres(fe.acreage)} ac)</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className={`text-2xl font-bold ${col.header}`}>{fmtAcres(card.totalAcres)}</p>
                                <p className={`text-xs font-medium ${col.header} opacity-70`}>total acres</p>
                                {card.applicationCostPerAcre > 0 && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    App cost: ${card.applicationCostPerAcre.toFixed(2)}/ac
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Chemical mix table — program totals */}
                          <div className="bg-white px-5 py-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                              Chemical Mix — Combined {fmtAcres(card.totalAcres)} ac
                            </p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left py-2 font-semibold text-gray-600 text-xs">Chemical</th>
                                  <th className="text-right py-2 font-semibold text-gray-600 text-xs">Rate / Acre</th>
                                  <th className="text-right py-2 font-semibold text-gray-600 text-xs pr-0">Total Needed</th>
                                </tr>
                              </thead>
                              <tbody>
                                {card.chemTotals.map((ct, i) => (
                                  <tr key={ct.chemicalId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    <td className="py-2.5 px-2 font-medium text-gray-900 rounded-l">{ct.chemicalName}</td>
                                    <td className="py-2.5 px-2 text-right text-gray-600">
                                      {ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {ct.rateUnit}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-bold text-gray-900 pr-0">{ct.totalDisplay}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Field breakdown toggle */}
                          {card.fields.length > 1 && (
                            <div className="border-t border-gray-100">
                              <button
                                onClick={() => toggleCard(card.programId)}
                                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                <span>Field Breakdown</span>
                                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>

                              {expanded && (
                                <div className="bg-gray-50 px-5 pb-4">
                                  <div className="space-y-4 pt-1">
                                    {card.fields.map((fe) => (
                                      <div key={fe.fieldId}>
                                        <p className="text-xs font-semibold text-gray-700 mb-2">
                                          {fe.fieldName}{' '}
                                          <span className="font-normal text-gray-400">({fmtAcres(fe.acreage)} ac)</span>
                                        </p>
                                        <table className="w-full text-xs">
                                          <tbody>
                                            {fe.chemicals.map((ch) => (
                                              <tr key={ch.chemicalId} className="border-b border-gray-100 last:border-0">
                                                <td className="py-1.5 text-gray-700">{ch.chemicalName}</td>
                                                <td className="py-1.5 text-right text-gray-500">
                                                  {ch.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {ch.rateUnit}/ac
                                                </td>
                                                <td className="py-1.5 text-right font-semibold text-gray-900 pl-4">{ch.totalDisplay}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </ReportCard>
  );
}
