import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toBestPracticalUnit, calculateCostWithConversion } from '../lib/unitConversions';
import { exportSprayPlannerPDF, exportSprayLogPDF, exportTableToCSV } from '../lib/exportUtils';
import type { CrossTotalRow } from '../lib/exportUtils';
import { CropType, Json } from '../lib/database.types';
import { ProgramReference } from '../lib/templateUtils';
import {
  saveWorkOrder,
  loadWorkOrders,
  deleteWorkOrder,
  applyWorkOrder,
  unapplyWorkOrder,
  fetchInventoryForChemicals,
  type SavedWorkOrder,
  type WorkOrderSavePayload,
} from '../lib/workOrderCrud';

interface RawFieldRow {
  id: string;
  name: string;
  crop_type: string;
  acreage: number;
  field_costs: { template_id: string | null } | { template_id: string | null }[] | null;
}

interface RawChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number | null;
  unit_type: string | null;
  epa_reg_number: string | null;
  master_product_id: string | null;
}

interface RawProgramItem {
  id: string;
  application_rate: number;
  application_rate_unit: string | null;
  notes: string | null;
  individual_chemicals: RawChemical | RawChemical[] | null;
}

interface RawProgram {
  id: string;
  program_name: string;
  crop_type: string;
  application_cost: number | null;
  chemical_program_items: RawProgramItem[] | null;
}

export interface FieldOption {
  id: string;
  name: string;
  cropType: CropType;
  acreage: number;
  programRefs: ProgramReference[];
}

export interface ChemicalItem {
  chemicalId: string;
  chemicalName: string;
  epaRegNumber: string | null;
  masterProductId: string | null;
  ratePerAcre: number;
  rateUnit: string;
  pricePerUnit: number;
  priceUnit: string;
  itemNotes: string | null;
}

export interface ProgramOption {
  id: string;
  name: string;
  cropType: CropType;
  applicationCostPerAcre: number;
  chemicalCostPerAcre: number;
  chemicals: ChemicalItem[];
}

export interface WorkOrderResult {
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
  effectiveAcres: number;
  chemTotals: Array<ChemicalItem & { totalDisplay: string; totalValue: number; totalUnit: string; totalRaw: number }>;
  sprayVolumeGalPerAcre: number | null;
  totalSprayVolumeGal: number | null;
}

export type { CrossTotalRow };

export function useSprayPlanner(currentSeasonId: string | null, effectiveUserId: string | null, farmId: string | null) {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Failures from apply/unapply. Kept separate from `error`, which gates the
  // whole page render — an action failure must not blank the planner.
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set());

  const [workOrders, setWorkOrders] = useState<WorkOrderResult[] | null>(null);
  const [crossTotals, setCrossTotals] = useState<CrossTotalRow[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [acreOverrides, setAcreOverrides] = useState<Map<string, number>>(new Map());
  const [chemOverrides, setChemOverridesState] = useState<Map<string, ChemicalItem[]>>(new Map());
  const [sprayVolumeOverrides, setSprayVolumeOverrides] = useState<Map<string, number>>(new Map());

  const [savedWorkOrders, setSavedWorkOrders] = useState<SavedWorkOrder[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [inventoryMap, setInventoryMap] = useState<Map<string, { masterProductId: string; onHand: number; unitType: string }>>(new Map());
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null);
  // Work order id whose apply/unapply is currently in flight.
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const loadedSeasonRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSeasonId || !effectiveUserId) {
      setLoading(false);
      return;
    }
    loadData(currentSeasonId);
  }, [currentSeasonId, effectiveUserId]);

  useEffect(() => {
    if (!currentSeasonId || !farmId) return;
    loadSavedWorkOrders();
  }, [currentSeasonId, farmId]);

  async function loadData(seasonId: string) {
    const seasonChanged = seasonId !== loadedSeasonRef.current;
    loadedSeasonRef.current = seasonId;

    setLoading(true);
    setError(null);

    // Only wipe selections when the user navigates to a different season.
    if (seasonChanged) {
      setWorkOrders(null);
      setSelectedFields(new Set());
      setSelectedPrograms(new Set());
      setAcreOverrides(new Map());
      setChemOverridesState(new Map());
      setSprayVolumeOverrides(new Map());
    }

    try {
      const [seasonRes, fieldsRes, progsRes] = await Promise.all([
        supabase.from('seasons').select('name, year').eq('id', currentSeasonId!).maybeSingle(),
        supabase.from('fields').select(`
          id, name, crop_type, acreage,
          field_costs ( template_id )
        `)
          .eq('season_id', currentSeasonId!)
          .order('name'),
        supabase.from('chemical_programs').select(`
          id, program_name, crop_type, application_cost,
          chemical_program_items (
            id, application_rate, application_rate_unit, notes,
            individual_chemicals ( id, chemical_name, price_per_unit, unit_type, epa_reg_number, master_product_id )
          )
        `)
          .eq('season_id', currentSeasonId!)
          .order('program_name'),
      ]);

      if (seasonRes.data) {
        setSeasonName(`${seasonRes.data.name} (${seasonRes.data.year})`);
      }
      if (fieldsRes.error) throw fieldsRes.error;
      if (progsRes.error) throw progsRes.error;

      const rawFields = (fieldsRes.data ?? []) as RawFieldRow[];
      const fieldIds = rawFields.map((f) => f.id);
      const templateIds = [...new Set(
        rawFields
          .map((f) => {
            const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
            return fc?.template_id ?? null;
          })
          .filter(Boolean) as string[]
      )];

      const [overridesRes, templatesRes] = await Promise.all([
        fieldIds.length > 0
          ? supabase.from('field_cost_overrides').select('field_id, cost_item_name, override_value')
              .in('field_id', fieldIds).eq('cost_item_name', 'chemical_programs')
          : Promise.resolve({ data: [] as { field_id: string; cost_item_name: string; override_value: Json }[], error: null }),
        templateIds.length > 0
          ? supabase.from('cost_templates').select('id, chemical_programs').in('id', templateIds)
          : Promise.resolve({ data: [] as { id: string; chemical_programs: Json }[], error: null }),
      ]);

      if (overridesRes.error) throw overridesRes.error;
      if (templatesRes.error) throw templatesRes.error;

      const overrideMap = new Map<string, ProgramReference[]>();
      for (const o of overridesRes.data ?? []) {
        overrideMap.set(o.field_id, o.override_value as unknown as ProgramReference[]);
      }
      const templateMap = new Map<string, ProgramReference[]>();
      for (const t of templatesRes.data ?? []) {
        templateMap.set(t.id, (t.chemical_programs as unknown as ProgramReference[]) ?? []);
      }

      const builtFields: FieldOption[] = rawFields.map((f) => {
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

      const builtPrograms: ProgramOption[] = ((progsRes.data ?? []) as RawProgram[]).map((p) => {
        const items = Array.isArray(p.chemical_program_items) ? p.chemical_program_items : [];
        const chemicals: ChemicalItem[] = items.map((item) => {
          const chem = Array.isArray(item.individual_chemicals)
            ? item.individual_chemicals[0]
            : item.individual_chemicals;
          return {
            chemicalId: chem?.id ?? item.id,
            chemicalName: chem?.chemical_name ?? 'Unknown',
            epaRegNumber: chem?.epa_reg_number ?? null,
            masterProductId: chem?.master_product_id ?? null,
            ratePerAcre: Number(item.application_rate),
            rateUnit: item.application_rate_unit ?? '',
            pricePerUnit: Number(chem?.price_per_unit ?? 0),
            priceUnit: chem?.unit_type ?? '',
            itemNotes: item.notes ?? null,
          };
        });
        const chemicalCostPerAcre = chemicals.reduce((sum, ch) => {
          const cost = calculateCostWithConversion(ch.ratePerAcre, ch.rateUnit, ch.pricePerUnit, ch.priceUnit);
          // Unconvertible units contribute nothing rather than a wrong number.
          // The per-item reason is shown on the Chemical Programs page.
          return cost.ok ? sum + cost.value : sum;
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

  const clearAllFields = () => {
    setSelectedFields(new Set());
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

  const buildWorkOrders = (
    allFields: FieldOption[],
    allPrograms: ProgramOption[],
    fieldSelection: Set<string>,
    programSelection: Set<string>,
    acreOvr: Map<string, number>,
    chemOvr: Map<string, ChemicalItem[]>,
    sprayVolOvr: Map<string, number>
  ) => {
    const chosenFields = allFields.filter((f) => fieldSelection.has(f.id));
    const chosenPrograms = allPrograms.filter((p) => programSelection.has(p.id));

    const results: WorkOrderResult[] = chosenPrograms.map((prog) => {
      // Use chem overrides if present, otherwise fall back to stored program chemicals
      const activeChems = chemOvr.get(prog.id) ?? prog.chemicals;

      const fieldRows = chosenFields.map((fe) => {
        const chems = activeChems.map((ch) => {
          const totalRaw = ch.ratePerAcre * fe.acreage;
          const practical = toBestPracticalUnit(totalRaw, ch.rateUnit);
          return { ...ch, totalDisplay: practical.display };
        });
        return { fieldId: fe.id, fieldName: fe.name, acreage: fe.acreage, chemicals: chems };
      });

      const totalAcres = chosenFields.reduce((s, f) => s + f.acreage, 0);
      const effectiveAcres = acreOvr.get(prog.id) ?? totalAcres;

      // When an acre override is set, scale totals proportionally using effectiveAcres.
      // Chemical overrides always use effectiveAcres too, ensuring consistency.
      const chemTotalMap = new Map<string, { ch: ChemicalItem; totalRaw: number }>();
      if (acreOvr.has(prog.id) || chemOvr.has(prog.id)) {
        for (const ch of activeChems) {
          chemTotalMap.set(ch.chemicalId, { ch, totalRaw: ch.ratePerAcre * effectiveAcres });
        }
      } else {
        for (const fe of fieldRows) {
          for (let i = 0; i < fe.chemicals.length; i++) {
            const ch = activeChems[i];
            if (!ch) continue;
            const rawTotal = ch.ratePerAcre * fe.acreage;
            const key = ch.chemicalId;
            const existing = chemTotalMap.get(key);
            if (existing) existing.totalRaw += rawTotal;
            else chemTotalMap.set(key, { ch, totalRaw: rawTotal });
          }
        }
      }

      const chemTotals = [...chemTotalMap.values()].map(({ ch, totalRaw }) => {
        const practical = toBestPracticalUnit(totalRaw, ch.rateUnit);
        return { ...ch, totalDisplay: practical.display, totalValue: practical.value, totalUnit: practical.unit, totalRaw };
      });

      const sprayVolumeGalPerAcre = sprayVolOvr.get(prog.id) ?? null;
      const totalSprayVolumeGal = sprayVolumeGalPerAcre !== null ? sprayVolumeGalPerAcre * effectiveAcres : null;

      return {
        programId: prog.id,
        programName: prog.name,
        cropType: prog.cropType,
        applicationCostPerAcre: prog.applicationCostPerAcre,
        chemicalCostPerAcre: prog.chemicalCostPerAcre,
        fields: fieldRows,
        totalAcres,
        effectiveAcres,
        chemTotals,
        sprayVolumeGalPerAcre,
        totalSprayVolumeGal,
      };
    });

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

    return { results, crossRows };
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

  const handleExportSprayLog = () => {
    if (!workOrders) return;
    exportSprayLogPDF(workOrders, seasonName);
  };

  const setAcreOverride = (programId: string, acres: number | null) => {
    const nextAcreMap = new Map(acreOverrides);
    if (acres === null) nextAcreMap.delete(programId);
    else nextAcreMap.set(programId, acres);
    const { results, crossRows } = buildWorkOrders(fields, programs, selectedFields, selectedPrograms, nextAcreMap, chemOverrides, sprayVolumeOverrides);
    setAcreOverrides(nextAcreMap);
    setWorkOrders(results);
    setCrossTotals(crossRows);
  };

  const setChemOverride = (programId: string, chemicals: ChemicalItem[] | null) => {
    const nextChemMap = new Map(chemOverrides);
    if (chemicals === null) nextChemMap.delete(programId);
    else nextChemMap.set(programId, chemicals);
    const { results, crossRows } = buildWorkOrders(fields, programs, selectedFields, selectedPrograms, acreOverrides, nextChemMap, sprayVolumeOverrides);
    setChemOverridesState(nextChemMap);
    setWorkOrders(results);
    setCrossTotals(crossRows);
  };

  const setSprayVolumeOverride = (programId: string, galPerAcre: number | null) => {
    const nextVolMap = new Map(sprayVolumeOverrides);
    if (galPerAcre === null) nextVolMap.delete(programId);
    else nextVolMap.set(programId, galPerAcre);
    const { results, crossRows } = buildWorkOrders(fields, programs, selectedFields, selectedPrograms, acreOverrides, chemOverrides, nextVolMap);
    setSprayVolumeOverrides(nextVolMap);
    setWorkOrders(results);
    setCrossTotals(crossRows);
  };

  const setWorkOrderOverrides = (
    programId: string,
    acres: number | null,
    galPerAcre: number | null,
    chemicals: ChemicalItem[] | null,
  ) => {
    const nextAcreMap = new Map(acreOverrides);
    if (acres === null) nextAcreMap.delete(programId); else nextAcreMap.set(programId, acres);

    const nextVolMap = new Map(sprayVolumeOverrides);
    if (galPerAcre === null) nextVolMap.delete(programId); else nextVolMap.set(programId, galPerAcre);

    const nextChemMap = new Map(chemOverrides);
    if (chemicals === null) nextChemMap.delete(programId); else nextChemMap.set(programId, chemicals);

    const { results, crossRows } = buildWorkOrders(fields, programs, selectedFields, selectedPrograms, nextAcreMap, nextChemMap, nextVolMap);
    setAcreOverrides(nextAcreMap);
    setSprayVolumeOverrides(nextVolMap);
    setChemOverridesState(nextChemMap);
    setWorkOrders(results);
    setCrossTotals(crossRows);
  };

  const toggleExpandedCard = (programId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(programId) ? next.delete(programId) : next.add(programId);
      return next;
    });
  };

  const computePreviewTotals = (chems: ChemicalItem[], effectiveAcres: number) =>
    chems.map((ch) => {
      const totalRaw = ch.ratePerAcre * effectiveAcres;
      const practical = toBestPracticalUnit(totalRaw, ch.rateUnit);
      return { ...ch, totalDisplay: practical.display };
    });

  // --- Saved work orders ---

  const loadSavedWorkOrders = useCallback(async () => {
    if (!farmId || !currentSeasonId) return;
    setSavedLoading(true);
    const data = await loadWorkOrders(farmId, currentSeasonId);
    setSavedWorkOrders(data);
    setSavedLoading(false);
  }, [farmId, currentSeasonId]);

  const handleSaveWorkOrder = async (wo: WorkOrderResult) => {
    if (!farmId || !currentSeasonId || !effectiveUserId) return;
    setSavingProgramId(wo.programId);

    const payload: WorkOrderSavePayload = {
      farmId,
      seasonId: currentSeasonId,
      programId: wo.programId,
      programName: wo.programName,
      cropType: wo.cropType,
      totalAcreage: wo.effectiveAcres,
      sprayVolumeGalPerAcre: wo.sprayVolumeGalPerAcre,
      fields: wo.fields.map((f) => ({
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        acreage: f.acreage,
      })),
      lines: wo.chemTotals.map((ct, idx) => {
        const inv = inventoryMap.get(ct.masterProductId ?? '') ?? inventoryMap.get(ct.chemicalName);
        return {
          masterProductId: ct.masterProductId ?? inv?.masterProductId ?? null,
          chemicalName: ct.chemicalName,
          ratePerAcre: ct.ratePerAcre,
          rateUnit: ct.rateUnit,
          totalNeeded: ct.totalRaw,
          pricePerUnit: ct.pricePerUnit,
          priceUnit: ct.priceUnit,
          sortOrder: idx,
        };
      }),
    };

    const result = await saveWorkOrder(payload);
    if (!result.ok) {
      // Previously this failed silently and still looked like a success.
      setActionError(result.message);
    }
    await loadSavedWorkOrders();
    setSavingProgramId(null);
  };

  const handleDeleteSavedWorkOrder = async (woId: string) => {
    await deleteWorkOrder(woId);
    await loadSavedWorkOrders();
  };

  // One in-flight apply/unapply at a time, per work order. The RPC is the real
  // guard against double-posting; this stops the second click ever being sent
  // and gives the user a spinner instead of silence (WI-9).
  const runInventoryAction = async (
    wo: SavedWorkOrder,
    action: (id: string, lines: SavedWorkOrder['lines']) => Promise<{ ok: true } | { ok: false; message: string }>
  ) => {
    if (applyingId !== null) return;
    setActionError(null);
    setApplyingId(wo.id);
    try {
      const result = await action(wo.id, wo.lines);
      if (result.ok) {
        await loadSavedWorkOrders();
      } else {
        setActionError(result.message);
        // The status may have moved underneath us; show the truth either way.
        await loadSavedWorkOrders();
      }
    } finally {
      setApplyingId(null);
    }
  };

  const handleApplyWorkOrder = (wo: SavedWorkOrder) => runInventoryAction(wo, applyWorkOrder);

  const handleUnapplyWorkOrder = (wo: SavedWorkOrder) => runInventoryAction(wo, unapplyWorkOrder);

  // --- Inventory fetch ---

  const refreshInventory = useCallback(async (productIds: string[], chemNames: string[]) => {
    if (!farmId || (productIds.length === 0 && chemNames.length === 0)) return;
    const map = await fetchInventoryForChemicals(farmId, productIds, chemNames);
    setInventoryMap(map);
  }, [farmId]);

  // When work orders are generated, fetch inventory for all chemicals
  const generateWithInventory = () => {
    const { results, crossRows } = buildWorkOrders(fields, programs, selectedFields, selectedPrograms, acreOverrides, chemOverrides, sprayVolumeOverrides);
    setWorkOrders(results);
    setCrossTotals(crossRows);
    setExpandedCards(new Set());
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    const allProductIds = [...new Set(results.flatMap((r) => r.chemTotals.map((c) => c.masterProductId)).filter((id): id is string => id != null))];
    const allChemNames = [...new Set(results.flatMap((r) => r.chemTotals.map((c) => c.chemicalName)))];
    refreshInventory(allProductIds, allChemNames);
  };

  const cropGroups = new Map<CropType, FieldOption[]>();
  for (const f of fields) {
    if (!cropGroups.has(f.cropType)) cropGroups.set(f.cropType, []);
    cropGroups.get(f.cropType)!.push(f);
  }

  const selectedAcres = fields.filter((f) => selectedFields.has(f.id)).reduce((s, f) => s + f.acreage, 0);
  const canGenerate = selectedFields.size > 0 && selectedPrograms.size > 0;

  return {
    fields,
    programs,
    loading,
    error,
    actionError,
    dismissActionError: () => setActionError(null),
    selectedFields,
    selectedPrograms,
    workOrders,
    crossTotals,
    expandedCards,
    resultsRef,
    cropGroups,
    selectedAcres,
    canGenerate,
    toggleField,
    toggleAllByCrop,
    toggleAllFields,
    clearAllFields,
    toggleProgram,
    generate: generateWithInventory,
    setAcreOverride,
    acreOverrides,
    setChemOverride,
    chemOverrides,
    setSprayVolumeOverride,
    sprayVolumeOverrides,
    setWorkOrderOverrides,
    handleExportCSV,
    handleExportPDF,
    handleExportSprayLog,
    toggleExpandedCard,
    computePreviewTotals,
    // Saved work orders
    savedWorkOrders,
    savedLoading,
    handleSaveWorkOrder,
    handleDeleteSavedWorkOrder,
    handleApplyWorkOrder,
    handleUnapplyWorkOrder,
    savingProgramId,
    applyingId,
    // Inventory
    inventoryMap,
    refreshInventory,
    seasonName,
  };
}
