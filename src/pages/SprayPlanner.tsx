import { useEffect, useRef, useState } from 'react';
import {
  Droplets,
  CheckSquare,
  Square,
  FlaskConical,
  FileDown,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ClipboardList,
  Printer,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toBestPracticalUnit, calculateCostWithConversion } from '../lib/unitConversions';
import { exportSprayPlannerPDF, exportTableToCSV } from '../lib/exportUtils';
import { CropType } from '../lib/database.types';
import { ProgramReference } from '../lib/templateUtils';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<CropType, { badge: string; badgeText: string; section: string; border: string; headerText: string }> = {
  corn:     { badge: 'bg-amber-100',  badgeText: 'text-amber-800',  section: 'bg-amber-50',  border: 'border-amber-200', headerText: 'text-amber-800' },
  soybeans: { badge: 'bg-green-100',  badgeText: 'text-green-800',  section: 'bg-green-50',  border: 'border-green-200', headerText: 'text-green-800' },
  wheat:    { badge: 'bg-orange-100', badgeText: 'text-orange-800', section: 'bg-orange-50', border: 'border-orange-200', headerText: 'text-orange-800' },
};

interface FieldOption {
  id: string;
  name: string;
  cropType: CropType;
  acreage: number;
  programRefs: ProgramReference[];
}

interface ChemicalItem {
  chemicalId: string;
  chemicalName: string;
  ratePerAcre: number;
  rateUnit: string;
  pricePerUnit: number;
  priceUnit: string;
}

interface ProgramOption {
  id: string;
  name: string;
  cropType: CropType;
  applicationCostPerAcre: number;
  chemicalCostPerAcre: number;
  chemicals: ChemicalItem[];
}

interface WorkOrderResult {
  programId: string;
  programName: string;
  cropType: CropType;
  applicationCostPerAcre: number;
  chemicalCostPerAcre: number;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    acreage: number;
    chemicals: Array<ChemicalItem & { totalDisplay: string }>;
  }>;
  totalAcres: number;
  chemTotals: Array<ChemicalItem & { totalDisplay: string; totalValue: number; totalUnit: string; totalRaw: number }>;
}

interface CrossTotalRow {
  chemicalId: string;
  chemicalName: string;
  totalDisplay: string;
}

interface Props {
  currentSeasonId: string | null;
  effectiveUserId: string | null;
}

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function SprayPlanner({ currentSeasonId, effectiveUserId }: Props) {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set());

  const [workOrders, setWorkOrders] = useState<WorkOrderResult[] | null>(null);
  const [crossTotals, setCrossTotals] = useState<CrossTotalRow[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentSeasonId || !effectiveUserId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [currentSeasonId, effectiveUserId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    setWorkOrders(null);
    setSelectedFields(new Set());
    setSelectedPrograms(new Set());

    try {
      const [seasonRes, fieldsRes, progsRes] = await Promise.all([
        supabase.from('seasons').select('name, year').eq('id', currentSeasonId!).maybeSingle(),
        supabase.from('fields').select(`
          id, name, crop_type, acreage,
          field_costs ( template_id )
        `)
          .eq('season_id', currentSeasonId!)
          .eq('user_id', effectiveUserId!)
          .order('name'),
        supabase.from('chemical_programs').select(`
          id, program_name, crop_type, application_cost,
          chemical_program_items (
            id, application_rate, application_rate_unit,
            individual_chemicals ( id, chemical_name, price_per_unit, unit_type )
          )
        `)
          .eq('user_id', effectiveUserId!)
          .eq('season_id', currentSeasonId!)
          .order('program_name'),
      ]);

      if (seasonRes.data) setSeasonName(`${seasonRes.data.name} (${seasonRes.data.year})`);
      if (fieldsRes.error) throw fieldsRes.error;
      if (progsRes.error) throw progsRes.error;

      // Resolve chemical programs from templates / overrides for each field
      const rawFields = fieldsRes.data ?? [];
      const fieldIds = rawFields.map((f: any) => f.id);
      const templateIds = [...new Set(
        rawFields
          .map((f: any) => {
            const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
            return fc?.template_id as string | null;
          })
          .filter(Boolean) as string[]
      )];

      const [overridesRes, templatesRes] = await Promise.all([
        fieldIds.length > 0
          ? supabase.from('field_cost_overrides').select('field_id, cost_item_name, override_value')
              .in('field_id', fieldIds).eq('cost_item_name', 'chemical_programs')
          : Promise.resolve({ data: [], error: null }),
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

      const builtFields: FieldOption[] = rawFields.map((f: any) => {
        const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
        const templateId: string | null = fc?.template_id ?? null;
        const override = overrideMap.get(f.id);
        const fromTemplate = templateId ? (templateMap.get(templateId) ?? []) : [];
        return {
          id: f.id,
          name: f.name,
          cropType: f.crop_type as CropType,
          acreage: Number(f.acreage),
          programRefs: override ?? fromTemplate,
        };
      });

      const builtPrograms: ProgramOption[] = (progsRes.data ?? []).map((p: any) => {
        const items = Array.isArray(p.chemical_program_items) ? p.chemical_program_items : [];
        const chemicals: ChemicalItem[] = items.map((item: any) => {
          const chem = Array.isArray(item.individual_chemicals)
            ? item.individual_chemicals[0]
            : item.individual_chemicals;
          return {
            chemicalId: chem?.id ?? item.id,
            chemicalName: chem?.chemical_name ?? 'Unknown',
            ratePerAcre: Number(item.application_rate),
            rateUnit: item.application_rate_unit ?? '',
            pricePerUnit: Number(chem?.price_per_unit ?? 0),
            priceUnit: chem?.unit_type ?? '',
          };
        });
        const chemicalCostPerAcre = chemicals.reduce((sum, ch) => {
          return sum + calculateCostWithConversion(ch.ratePerAcre, ch.rateUnit, ch.pricePerUnit, ch.priceUnit);
        }, 0);
        return {
          id: p.id,
          name: p.program_name,
          cropType: p.crop_type as CropType,
          applicationCostPerAcre: Number(p.application_cost ?? 0),
          chemicalCostPerAcre,
          chemicals,
        };
      });

      setFields(builtFields);
      setPrograms(builtPrograms);
    } catch (err: any) {
      setError('Failed to load planner data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ---------- selection helpers ----------
  const toggleField = (id: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setWorkOrders(null);
  };

  const toggleAllByCrop = (cropType: CropType) => {
    const crop = fields.filter((f) => f.cropType === cropType);
    const allSelected = crop.every((f) => selectedFields.has(f.id));
    setSelectedFields((prev) => {
      const next = new Set(prev);
      crop.forEach((f) => (allSelected ? next.delete(f.id) : next.add(f.id)));
      return next;
    });
    setWorkOrders(null);
  };

  const toggleAllFields = () => {
    if (selectedFields.size === fields.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(fields.map((f) => f.id)));
    }
    setWorkOrders(null);
  };

  const toggleProgram = (id: string) => {
    setSelectedPrograms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setWorkOrders(null);
  };

  // ---------- generate work orders ----------
  const generate = () => {
    const chosenFields = fields.filter((f) => selectedFields.has(f.id));
    const chosenPrograms = programs.filter((p) => selectedPrograms.has(p.id));

    // For each selected program, compute per-field quantities
    const results: WorkOrderResult[] = chosenPrograms.map((prog) => {
      const fieldRows = chosenFields.map((fe) => {
        const chems = prog.chemicals.map((ch) => {
          const totalRaw = ch.ratePerAcre * fe.acreage;
          const practical = toBestPracticalUnit(totalRaw, ch.rateUnit);
          return { ...ch, totalDisplay: practical.display };
        });
        return { fieldId: fe.id, fieldName: fe.name, acreage: fe.acreage, chemicals: chems };
      });

      const totalAcres = chosenFields.reduce((s, f) => s + f.acreage, 0);

      // Aggregate totals per chemical
      const chemTotalMap = new Map<string, { ch: ChemicalItem; totalRaw: number }>();
      for (const fe of fieldRows) {
        for (let i = 0; i < fe.chemicals.length; i++) {
          const ch = prog.chemicals[i];
          const rawTotal = ch.ratePerAcre * fe.acreage;
          const key = ch.chemicalId;
          const existing = chemTotalMap.get(key);
          if (existing) existing.totalRaw += rawTotal;
          else chemTotalMap.set(key, { ch, totalRaw: rawTotal });
        }
      }

      const chemTotals = [...chemTotalMap.values()].map(({ ch, totalRaw }) => {
        const practical = toBestPracticalUnit(totalRaw, ch.rateUnit);
        return { ...ch, totalDisplay: practical.display, totalValue: practical.value, totalUnit: practical.unit, totalRaw };
      });

      return {
        programId: prog.id,
        programName: prog.name,
        cropType: prog.cropType,
        applicationCostPerAcre: prog.applicationCostPerAcre,
        chemicalCostPerAcre: prog.chemicalCostPerAcre,
        fields: fieldRows,
        totalAcres,
        chemTotals,
      };
    });

    // Cross-program totals (combine same chemical across all programs)
    const crossMap = new Map<string, { chemicalId: string; chemicalName: string; totalRaw: number; rateUnit: string }>();
    for (const wo of results) {
      for (const ct of wo.chemTotals) {
        const existing = crossMap.get(ct.chemicalId);
        if (existing) {
          existing.totalRaw += ct.totalRaw;
        } else {
          crossMap.set(ct.chemicalId, {
            chemicalId: ct.chemicalId,
            chemicalName: ct.chemicalName,
            rateUnit: ct.rateUnit,
            totalRaw: ct.totalRaw,
          });
        }
      }
    }
    const crossRows: CrossTotalRow[] = [...crossMap.values()].map((c) => ({
      chemicalId: c.chemicalId,
      chemicalName: c.chemicalName,
      totalDisplay: toBestPracticalUnit(c.totalRaw, c.rateUnit).display,
    }));

    setWorkOrders(results);
    setCrossTotals(crossRows);
    setExpandedCards(new Set());

    // Scroll to results
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleExportCSV = () => {
    if (!workOrders) return;
    const headers = ['Program', 'Field', 'Acres', 'Chemical', 'Rate / Acre', 'Rate Unit', 'Total Needed'];
    const rows: (string | number)[][] = [];
    for (const wo of workOrders) {
      for (const fe of wo.fields) {
        for (const ch of fe.chemicals) {
          rows.push([wo.programName, fe.fieldName, fe.acreage.toFixed(1), ch.chemicalName, ch.ratePerAcre, ch.rateUnit, ch.totalDisplay]);
        }
      }
    }
    exportTableToCSV('spray-plan', headers, rows);
  };

  const handleExportPDF = () => {
    if (!workOrders) return;
    exportSprayPlannerPDF(workOrders, crossTotals, seasonName);
  };

  // ---------- derived ----------
  const cropGroups = new Map<CropType, FieldOption[]>();
  for (const f of fields) {
    if (!cropGroups.has(f.cropType)) cropGroups.set(f.cropType, []);
    cropGroups.get(f.cropType)!.push(f);
  }

  const selectedAcres = fields.filter((f) => selectedFields.has(f.id)).reduce((s, f) => s + f.acreage, 0);
  const canGenerate = selectedFields.size > 0 && selectedPrograms.size > 0;

  if (!currentSeasonId) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Droplets className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No active season selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((j) => <div key={j} className="h-10 bg-gray-100 rounded" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Droplets className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Spray Planner</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">Select fields and chemical programs to generate a custom spray work order.</p>
      </div>

      {/* Step 1 — Field Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="font-semibold text-gray-900">Select Fields</h2>
          </div>
          <div className="flex items-center gap-3">
            {selectedFields.size > 0 && (
              <span className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{selectedFields.size}</span> field{selectedFields.size !== 1 ? 's' : ''} · <span className="font-semibold text-gray-900">{fmtAcres(selectedAcres)}</span> ac
              </span>
            )}
            <button
              onClick={toggleAllFields}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              {selectedFields.size === fields.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {fields.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            <p>No fields found for the active season.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {[...cropGroups.entries()].map(([cropType, cropFields]) => {
              const col = CROP_COLORS[cropType];
              const allSelected = cropFields.every((f) => selectedFields.has(f.id));
              const someSelected = cropFields.some((f) => selectedFields.has(f.id));
              return (
                <div key={cropType} className="px-6 py-4">
                  {/* Crop group header */}
                  <button
                    onClick={() => toggleAllByCrop(cropType)}
                    className="flex items-center gap-2 mb-3 group"
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      allSelected ? 'bg-blue-600 border-blue-600' : someSelected ? 'bg-blue-100 border-blue-400' : 'border-gray-300 group-hover:border-blue-400'
                    }`}>
                      {allSelected && <CheckSquare className="w-3 h-3 text-white" strokeWidth={3} />}
                      {someSelected && !allSelected && <div className="w-2 h-0.5 bg-blue-600 rounded" />}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge} ${col.badgeText}`}>
                      {CROP_LABELS[cropType]}
                    </span>
                    <span className="text-xs text-gray-400">{cropFields.length} field{cropFields.length !== 1 ? 's' : ''}</span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
                    {cropFields.map((f) => {
                      const selected = selectedFields.has(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleField(f.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                            selected
                              ? 'bg-blue-50 border-blue-300 shadow-sm'
                              : 'bg-gray-50 border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                          }`}>
                            {selected && <span className="text-white text-xs leading-none">✓</span>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                            <p className="text-xs text-gray-400">{fmtAcres(f.acreage)} ac</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2 — Program Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
          <h2 className="font-semibold text-gray-900">Select Programs to Spray</h2>
          {selectedPrograms.size > 0 && (
            <span className="ml-auto text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{selectedPrograms.size}</span> selected
            </span>
          )}
        </div>

        {programs.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No chemical programs found. Add programs in the Products page.</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {programs.map((prog) => {
              const selected = selectedPrograms.has(prog.id);
              const col = CROP_COLORS[prog.cropType];
              return (
                <button
                  key={prog.id}
                  onClick={() => toggleProgram(prog.id)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    selected
                      ? 'bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {selected && <span className="text-white text-xs leading-none">✓</span>}
                        </div>
                        <span className="font-semibold text-sm text-gray-900">{prog.name}</span>
                      </div>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${col.badge} ${col.badgeText} mb-2`}>
                        {CROP_LABELS[prog.cropType]}
                      </span>
                      {prog.chemicals.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {prog.chemicals.map((ch) => (
                            <span key={ch.chemicalId} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                              {ch.chemicalName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {(prog.applicationCostPerAcre > 0 || prog.chemicalCostPerAcre > 0) && (
                      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                        ${(prog.applicationCostPerAcre + prog.chemicalCostPerAcre).toFixed(2)}/ac
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={generate}
          disabled={!canGenerate}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm shadow-sm transition-all ${
            canGenerate
              ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-95'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Generate Work Order
        </button>
      </div>

      {/* Warning: fields with no assigned program */}
      {selectedFields.size > 0 && selectedPrograms.size === 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
          Select at least one chemical program to generate a work order.
        </div>
      )}

      {/* Work Order Results */}
      {workOrders && (
        <div ref={resultsRef} className="space-y-5">
          {/* Results header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Spray Work Order</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} · {fmtAcres(selectedAcres)} ac · {selectedPrograms.size} program{selectedPrograms.size !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 border border-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / PDF
              </button>
            </div>
          </div>

          {/* One card per program */}
          {workOrders.map((wo) => {
            const col = CROP_COLORS[wo.cropType];
            const expanded = expandedCards.has(wo.programId);
            return (
              <div key={wo.programId} className={`border ${col.border} rounded-xl overflow-hidden shadow-sm`}>
                {/* Card header */}
                <div className={`${col.section} px-5 py-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <FlaskConical className={`w-4 h-4 ${col.headerText}`} />
                        <h3 className={`font-bold text-lg ${col.headerText}`}>{wo.programName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge} ${col.badgeText}`}>
                          {CROP_LABELS[wo.cropType]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {wo.fields.map((fe) => (
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
                      <p className={`text-2xl font-bold ${col.headerText}`}>{fmtAcres(wo.totalAcres)}</p>
                      <p className={`text-xs ${col.headerText} opacity-70`}>total acres</p>
                      {(wo.applicationCostPerAcre > 0 || wo.chemicalCostPerAcre > 0) && (
                        <div className="mt-1 text-right">
                          <p className="text-sm font-semibold text-gray-700">
                            ${(wo.applicationCostPerAcre + wo.chemicalCostPerAcre).toFixed(2)}/ac
                          </p>
                          <p className="text-xs text-gray-400">
                            Chem: ${wo.chemicalCostPerAcre.toFixed(2)} + App: ${wo.applicationCostPerAcre.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chemical mix table */}
                <div className="bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Chemical Mix — {fmtAcres(wo.totalAcres)} Combined Acres
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 font-semibold text-gray-600 text-xs">Chemical</th>
                        <th className="text-right py-2 font-semibold text-gray-600 text-xs">Rate / Acre</th>
                        <th className="text-right py-2 font-semibold text-gray-600 text-xs">Total Needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wo.chemTotals.map((ct, i) => (
                        <tr key={ct.chemicalId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2.5 px-2 font-medium text-gray-900 rounded-l">{ct.chemicalName}</td>
                          <td className="py-2.5 px-2 text-right text-gray-600">
                            {ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {ct.rateUnit}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold text-gray-900">{ct.totalDisplay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Per-field breakdown toggle */}
                {wo.fields.length > 1 && (
                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => {
                        setExpandedCards((prev) => {
                          const next = new Set(prev);
                          next.has(wo.programId) ? next.delete(wo.programId) : next.add(wo.programId);
                          return next;
                        });
                      }}
                      className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <span>Per-Field Breakdown</span>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {expanded && (
                      <div className="bg-gray-50 px-5 pb-4 space-y-4 pt-1">
                        {wo.fields.map((fe) => (
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
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand total — all chemicals across all programs */}
          {crossTotals.length > 0 && workOrders.length > 1 && (
            <div className="bg-gray-900 rounded-xl px-5 py-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
                Full Spray Day — Combined Chemical Totals
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {crossTotals.map((ct) => (
                  <div key={ct.chemicalId} className="bg-gray-800 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400 mb-1 leading-snug">{ct.chemicalName}</p>
                    <p className="text-xl font-bold text-white">{ct.totalDisplay}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
