import { useEffect, useState } from 'react';
import { Sprout, Beaker, FlaskConical, Loader2, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRate } from '../../lib/mathUtils';
import {
  resolveFieldFertilizerItems,
  type FertilizerProductMeta,
  type FieldRate,
  type ProgramItemRate,
} from '../../lib/fieldFertilizerRates';

interface SeedVarietyInfo {
  id: string;
  product_name: string;
  crop_type: string;
  price_per_unit: number;
  unit_type: string;
  standard_seeding_rate: number | null;
}

interface FertilizerProgramInfo {
  id: string;
  program_name: string;
  application_cost: number;
  cost_per_acre: number;
  /** True when these rates came from the field rather than the program. */
  has_field_rates: boolean;
  items: Array<{
    product_name: string;
    application_rate: number;
    application_rate_unit: string;
    price_per_unit: number;
    unit_type: string;
  }>;
}

interface ChemicalProgramInfo {
  id: string;
  program_name: string;
  application_cost: number;
  cost_per_acre: number;
  items: Array<{
    chemical_name: string;
    application_rate: number;
    application_rate_unit: string;
    price_per_unit: number;
    unit_type: string;
  }>;
}

interface FieldProgramDetailsProps {
  fieldId: string;
  seedCostPerAcre: number;
  fertilizerCostPerAcre: number;
  chemicalCostPerAcre: number;
  /** Opens the per-field plan editor. Omitted where there is nothing to edit. */
  onEditFertilizerPlan?: () => void;
}

export function FieldProgramDetails({
  fieldId,
  seedCostPerAcre,
  fertilizerCostPerAcre,
  chemicalCostPerAcre,
  onEditFertilizerPlan,
}: FieldProgramDetailsProps) {
  const [seedVariety, setSeedVariety] = useState<SeedVarietyInfo | null>(null);
  const [seedingRate, setSeedingRate] = useState<number | null>(null);
  const [fertilizerPrograms, setFertilizerPrograms] = useState<FertilizerProgramInfo[]>([]);
  const [chemicalPrograms, setChemicalPrograms] = useState<ChemicalProgramInfo[]>([]);
  const [fertilizerIsCustom, setFertilizerIsCustom] = useState(false);
  const [chemicalIsCustom, setChemicalIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgramDetails();
  }, [fieldId]);

  const loadProgramDetails = async () => {
    setLoading(true);
    try {
      // The season scopes the product catalogue the resolved rates are read against.
      const { data: fieldRow } = await supabase
        .from('fields')
        .select('season_id')
        .eq('id', fieldId)
        .maybeSingle();

      const { data: fieldCosts } = await supabase
        .from('field_costs')
        .select('seed_variety_id, seeding_rate_override, template_id')
        .eq('field_id', fieldId)
        .maybeSingle();

      if (!fieldCosts) {
        setLoading(false);
        return;
      }

      // Load seed variety
      if (fieldCosts.seed_variety_id) {
        const { data: variety } = await supabase
          .from('seed_varieties')
          .select('id, product_name, crop_type, price_per_unit, unit_type, standard_seeding_rate')
          .eq('id', fieldCosts.seed_variety_id)
          .maybeSingle();

        if (variety) {
          setSeedVariety(variety);
          setSeedingRate(fieldCosts.seeding_rate_override ?? variety.standard_seeding_rate);
        }
      }

      /*
       * The field's OWN program list wins over its template's — V-0, defect 3.
       *
       * A field may carry its own programs in `field_cost_overrides` under
       * 'fertilizer_programs' / 'chemical_programs'. This component read the template and
       * nothing else, so such a field displayed its template's programs while its costs
       * came from the override: the screen was confidently wrong about the one thing it
       * exists to show. Zero rows of that shape exist today, so it has never been seen.
       *
       * A field with an override and no template is now rendered too. It used to fall
       * through the `if (template_id)` guard and show nothing at all.
       */
      const { data: overrideRows, error: overrideError } = await supabase
        .from('field_cost_overrides')
        .select('cost_item_name, override_value')
        .eq('field_id', fieldId)
        .in('cost_item_name', ['fertilizer_programs', 'chemical_programs']);

      if (overrideError) throw overrideError;

      const overrideMap = new Map<string, unknown>(
        (overrideRows ?? []).map((o) => [o.cost_item_name, o.override_value])
      );

      let templateFertilizer: unknown = null;
      let templateChemical: unknown = null;

      if (fieldCosts.template_id) {
        const { data: template } = await supabase
          .from('cost_templates')
          .select('fertilizer_programs, chemical_programs')
          .eq('id', fieldCosts.template_id)
          .maybeSingle();

        if (template) {
          templateFertilizer = template.fertilizer_programs;
          templateChemical = template.chemical_programs;
        }
      }

      const fertilizerCustom = overrideMap.has('fertilizer_programs');
      const chemicalCustom = overrideMap.has('chemical_programs');
      setFertilizerIsCustom(fertilizerCustom);
      setChemicalIsCustom(chemicalCustom);

      await Promise.all([
        loadFertilizerPrograms(
          fertilizerCustom ? overrideMap.get('fertilizer_programs') : templateFertilizer,
          fieldRow?.season_id ?? null
        ),
        loadChemicalPrograms(
          chemicalCustom ? overrideMap.get('chemical_programs') : templateChemical
        ),
      ]);
    } catch (err) {
      console.error('Error loading program details:', err);
    } finally {
      setLoading(false);
    }
  };

  /*
   * Fertilizer rates come from the FIELD where it has its own, and the program otherwise —
   * V-5 follow-up, 6 Sep.
   *
   * V-0 fixed which PROGRAMS this component shows. It kept reading each program's item
   * rates straight from `fertilizer_program_items`, which is the shared list, so the first
   * field ever given a custom rate displayed the program's 185 lb/ac while its stored rate,
   * its cost and its field total all said 200. The money was right and the screen was not,
   * which is the same shape as defect 3 one level deeper.
   *
   * Resolution goes through `resolveFieldFertilizerItems` — the same function the editor,
   * the cost math and (at V-8) the shopping list use, so they cannot disagree about what a
   * field's rate is.
   */
  const loadFertilizerPrograms = async (programsJson: unknown, seasonId: string | null) => {
    if (!Array.isArray(programsJson) || programsJson.length === 0) {
      setFertilizerPrograms([]);
      return;
    }

    const refs = programsJson as Array<{ program_id: string; cost_per_acre: number }>;
    const ids = refs.map((r) => r.program_id);
    const costMap = new Map(refs.map((r) => [r.program_id, r.cost_per_acre]));

    const [programRes, itemRes, productRes, rateRes] = await Promise.all([
      supabase.from('fertilizer_programs').select('id, program_name, application_cost').in('id', ids),
      supabase
        .from('fertilizer_program_items')
        .select('program_id, fertilizer_product_id, application_rate, application_rate_unit')
        .in('program_id', ids),
      seasonId
        ? supabase
            .from('fertilizer_products')
            .select('id, product_name, unit_type, price_per_unit, density_lb_per_gal')
            .eq('season_id', seasonId)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('field_fertilizer_rates')
        .select('field_id, program_id, fertilizer_product_id, application_rate, application_rate_unit')
        .eq('field_id', fieldId),
    ]);

    const programs = programRes.data;
    if (!programs || programs.length === 0) {
      setFertilizerPrograms([]);
      return;
    }

    const products = new Map<string, FertilizerProductMeta>(
      (productRes.data ?? []).map((p: any) => [
        p.id,
        {
          productId: p.id,
          productName: p.product_name,
          unitType: p.unit_type,
          pricePerUnit: Number(p.price_per_unit ?? 0),
          density: p.density_lb_per_gal == null ? null : Number(p.density_lb_per_gal),
        },
      ])
    );

    const fieldRates: FieldRate[] = (rateRes.data ?? []).map((r) => ({
      fieldId: r.field_id,
      programId: r.program_id,
      productId: r.fertilizer_product_id,
      rate: Number(r.application_rate),
      rateUnit: r.application_rate_unit,
    }));

    const itemsByProgram = new Map<string, ProgramItemRate[]>();
    for (const item of itemRes.data ?? []) {
      const list = itemsByProgram.get(item.program_id) ?? [];
      list.push({
        productId: item.fertilizer_product_id,
        rate: Number(item.application_rate),
        rateUnit: item.application_rate_unit,
      });
      itemsByProgram.set(item.program_id, list);
    }

    const result: FertilizerProgramInfo[] = programs.map((p) => {
      const resolved = resolveFieldFertilizerItems(
        fieldId, p.id, itemsByProgram.get(p.id) ?? [], fieldRates, products
      );
      return {
        id: p.id,
        program_name: p.program_name,
        application_cost: Number(p.application_cost ?? 0),
        cost_per_acre: costMap.get(p.id) ?? 0,
        has_field_rates: resolved.isCustom,
        items: resolved.items.map((i) => ({
          product_name: i.product.productName,
          application_rate: i.rate,
          application_rate_unit: i.rateUnit,
          price_per_unit: i.product.pricePerUnit,
          unit_type: i.product.unitType,
        })),
      };
    });

    setFertilizerPrograms(result);
  };

  const loadChemicalPrograms = async (programsJson: unknown) => {
    if (!Array.isArray(programsJson) || programsJson.length === 0) {
      setChemicalPrograms([]);
      return;
    }

    const refs = programsJson as Array<{ program_id: string; cost_per_acre: number }>;
    const ids = refs.map((r) => r.program_id);
    const costMap = new Map(refs.map((r) => [r.program_id, r.cost_per_acre]));

    const { data: programs } = await supabase
      .from('chemical_programs')
      .select('id, program_name, application_cost')
      .in('id', ids);

    if (!programs || programs.length === 0) {
      setChemicalPrograms([]);
      return;
    }

    const { data: items } = await supabase
      .from('chemical_program_items')
      .select(`
        program_id,
        application_rate,
        application_rate_unit,
        individual_chemicals ( chemical_name, price_per_unit, unit_type )
      `)
      .in('program_id', ids);

    const itemsByProgram = new Map<string, ChemicalProgramInfo['items']>();
    for (const item of items || []) {
      const chemical = (item as any).individual_chemicals;
      if (!chemical) continue;
      const list = itemsByProgram.get(item.program_id) ?? [];
      list.push({
        chemical_name: chemical.chemical_name,
        application_rate: Number(item.application_rate),
        application_rate_unit: item.application_rate_unit || '',
        price_per_unit: Number(chemical.price_per_unit),
        unit_type: chemical.unit_type,
      });
      itemsByProgram.set(item.program_id, list);
    }

    const result: ChemicalProgramInfo[] = programs.map((p) => ({
      id: p.id,
      program_name: p.program_name,
      application_cost: Number(p.application_cost ?? 0),
      cost_per_acre: costMap.get(p.id) ?? 0,
      items: itemsByProgram.get(p.id) ?? [],
    }));

    setChemicalPrograms(result);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Seed Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Seed</h2>
          </div>
        </div>
        <div className="p-4">
          {seedVariety ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">{seedVariety.product_name}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 capitalize">
                    {seedVariety.crop_type}
                  </span>
                </div>
                <span className="font-medium text-gray-900">${seedCostPerAcre.toFixed(2)}/acre</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Price</span>
                  <p className="font-medium text-gray-800">
                    ${Number(seedVariety.price_per_unit).toFixed(2)}/{seedVariety.unit_type}
                  </p>
                </div>
                {seedingRate != null && (
                  <div>
                    <span className="text-gray-500">Seeding Rate</span>
                    <p className="font-medium text-gray-800">
                      {seedingRate.toLocaleString()} seeds/acre
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No seed variety assigned</p>
          )}
        </div>
      </div>

      {/* Fertilizer Programs Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-gray-900">Fertilizer Programs</h2>
              {fertilizerIsCustom && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                  title="This field has its own fertilizer programs, not its template's"
                >
                  Custom for this field
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-900">${fertilizerCostPerAcre.toFixed(2)}/acre</span>
              {onEditFertilizerPlan && (
                <button
                  type="button"
                  onClick={onEditFertilizerPlan}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit plan
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="p-4">
          {fertilizerPrograms.length > 0 ? (
            <div className="space-y-4">
              {fertilizerPrograms.map((prog) => (
                <div key={prog.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-800">{prog.program_name}</h3>
                    <span className="text-sm text-gray-600">${prog.cost_per_acre.toFixed(2)}/acre</span>
                  </div>
                  {prog.items.length > 0 && (
                    <div className="bg-gray-50 rounded px-3 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs">
                            <th className="text-left font-medium pb-1">
                              Product
                              {prog.has_field_rates && (
                                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  Field rates
                                </span>
                              )}
                            </th>
                            <th className="text-right font-medium pb-1">Rate</th>
                            <th className="text-right font-medium pb-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prog.items.map((item, idx) => (
                            <tr key={idx} className="text-gray-700">
                              <td className="py-0.5">{item.product_name}</td>
                              <td className="py-0.5 text-right whitespace-nowrap">
                                {formatRate(Number(item.application_rate))} {item.application_rate_unit}/ac
                              </td>
                              <td className="py-0.5 text-right whitespace-nowrap">
                                ${Number(item.price_per_unit).toFixed(2)}/{item.unit_type}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {prog.application_cost > 0 && (
                        <div className="mt-1 pt-1 border-t border-gray-200 text-xs text-gray-500 text-right">
                          Application cost: ${prog.application_cost.toFixed(2)}/acre
                        </div>
                      )}
                    </div>
                  )}
                  {prog.items.length === 0 && (
                    <p className="text-xs text-gray-400">No products in this program</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No fertilizer programs assigned</p>
          )}
        </div>
      </div>

      {/* Chemical Programs Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Chemical Programs</h2>
              {chemicalIsCustom && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                  title="This field has its own chemical programs, not its template's"
                >
                  Custom for this field
                </span>
              )}
            </div>
            <span className="font-medium text-gray-900">${chemicalCostPerAcre.toFixed(2)}/acre</span>
          </div>
        </div>
        <div className="p-4">
          {chemicalPrograms.length > 0 ? (
            <div className="space-y-4">
              {chemicalPrograms.map((prog) => (
                <div key={prog.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-800">{prog.program_name}</h3>
                    <span className="text-sm text-gray-600">${prog.cost_per_acre.toFixed(2)}/acre</span>
                  </div>
                  {prog.items.length > 0 && (
                    <div className="bg-gray-50 rounded px-3 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs">
                            <th className="text-left font-medium pb-1">Chemical</th>
                            <th className="text-right font-medium pb-1">Rate</th>
                            <th className="text-right font-medium pb-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prog.items.map((item, idx) => (
                            <tr key={idx} className="text-gray-700">
                              <td className="py-0.5">{item.chemical_name}</td>
                              <td className="py-0.5 text-right whitespace-nowrap">
                                {formatRate(Number(item.application_rate))} {item.application_rate_unit}/ac
                              </td>
                              <td className="py-0.5 text-right whitespace-nowrap">
                                ${Number(item.price_per_unit).toFixed(2)}/{item.unit_type}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {prog.application_cost > 0 && (
                        <div className="mt-1 pt-1 border-t border-gray-200 text-xs text-gray-500 text-right">
                          Application cost: ${prog.application_cost.toFixed(2)}/acre
                        </div>
                      )}
                    </div>
                  )}
                  {prog.items.length === 0 && (
                    <p className="text-xs text-gray-400">No chemicals in this program</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No chemical programs assigned</p>
          )}
        </div>
      </div>
    </div>
  );
}
