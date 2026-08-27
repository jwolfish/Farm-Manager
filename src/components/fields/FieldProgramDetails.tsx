import { useEffect, useState } from 'react';
import { Sprout, Beaker, FlaskConical, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
}

export function FieldProgramDetails({
  fieldId,
  seedCostPerAcre,
  fertilizerCostPerAcre,
  chemicalCostPerAcre,
}: FieldProgramDetailsProps) {
  const [seedVariety, setSeedVariety] = useState<SeedVarietyInfo | null>(null);
  const [seedingRate, setSeedingRate] = useState<number | null>(null);
  const [fertilizerPrograms, setFertilizerPrograms] = useState<FertilizerProgramInfo[]>([]);
  const [chemicalPrograms, setChemicalPrograms] = useState<ChemicalProgramInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgramDetails();
  }, [fieldId]);

  const loadProgramDetails = async () => {
    setLoading(true);
    try {
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

      // Load template programs
      if (fieldCosts.template_id) {
        const { data: template } = await supabase
          .from('cost_templates')
          .select('fertilizer_programs, chemical_programs')
          .eq('id', fieldCosts.template_id)
          .maybeSingle();

        if (template) {
          await Promise.all([
            loadFertilizerPrograms(template.fertilizer_programs),
            loadChemicalPrograms(template.chemical_programs),
          ]);
        }
      }
    } catch (err) {
      console.error('Error loading program details:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFertilizerPrograms = async (programsJson: unknown) => {
    if (!Array.isArray(programsJson) || programsJson.length === 0) {
      setFertilizerPrograms([]);
      return;
    }

    const refs = programsJson as Array<{ program_id: string; cost_per_acre: number }>;
    const ids = refs.map((r) => r.program_id);
    const costMap = new Map(refs.map((r) => [r.program_id, r.cost_per_acre]));

    const { data: programs } = await supabase
      .from('fertilizer_programs')
      .select('id, program_name, application_cost')
      .in('id', ids);

    if (!programs || programs.length === 0) {
      setFertilizerPrograms([]);
      return;
    }

    const { data: items } = await supabase
      .from('fertilizer_program_items')
      .select(`
        program_id,
        application_rate,
        application_rate_unit,
        fertilizer_products ( product_name, price_per_unit, unit_type )
      `)
      .in('program_id', ids);

    const itemsByProgram = new Map<string, FertilizerProgramInfo['items']>();
    for (const item of items || []) {
      const product = (item as any).fertilizer_products;
      if (!product) continue;
      const list = itemsByProgram.get(item.program_id) ?? [];
      list.push({
        product_name: product.product_name,
        application_rate: Number(item.application_rate),
        application_rate_unit: item.application_rate_unit,
        price_per_unit: Number(product.price_per_unit),
        unit_type: product.unit_type,
      });
      itemsByProgram.set(item.program_id, list);
    }

    const result: FertilizerProgramInfo[] = programs.map((p) => ({
      id: p.id,
      program_name: p.program_name,
      application_cost: Number(p.application_cost ?? 0),
      cost_per_acre: costMap.get(p.id) ?? 0,
      items: itemsByProgram.get(p.id) ?? [],
    }));

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
            </div>
            <span className="font-medium text-gray-900">${fertilizerCostPerAcre.toFixed(2)}/acre</span>
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
                            <th className="text-left font-medium pb-1">Product</th>
                            <th className="text-right font-medium pb-1">Rate</th>
                            <th className="text-right font-medium pb-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prog.items.map((item, idx) => (
                            <tr key={idx} className="text-gray-700">
                              <td className="py-0.5">{item.product_name}</td>
                              <td className="py-0.5 text-right whitespace-nowrap">
                                {item.application_rate} {item.application_rate_unit}/ac
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
                                {item.application_rate} {item.application_rate_unit}/ac
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
