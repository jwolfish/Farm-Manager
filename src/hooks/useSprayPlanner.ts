import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toBestPracticalUnit, calculateCostWithConversion } from '../lib/unitConversions';
import { exportSprayPlannerPDF, exportTableToCSV } from '../lib/exportUtils';
import { CropType } from '../lib/database.types';
import { ProgramReference } from '../lib/templateUtils';

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
  ratePerAcre: number;
  rateUnit: string;
  pricePerUnit: number;
  priceUnit: string;
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
  chemTotals: Array<ChemicalItem & { totalDisplay: string; totalValue: number; totalUnit: string; totalRaw: number }>;
}

export interface CrossTotalRow {
  chemicalId: string;
  chemicalName: string;
  totalDisplay: string;
}

export function useSprayPlanner(currentSeasonId: string | null, effectiveUserId: string | null) {
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

  const generate = () => {
    const chosenFields = fields.filter((f) => selectedFields.has(f.id));
    const chosenPrograms = programs.filter((p) => selectedPrograms.has(p.id));

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

  const toggleExpandedCard = (programId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(programId) ? next.delete(programId) : next.add(programId);
      return next;
    });
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
    generate,
    handleExportCSV,
    handleExportPDF,
    toggleExpandedCard,
  };
}
