import { supabase } from '../supabase';
import { toBestPracticalUnit } from '../unitConversions';
import type { SavedWorkOrder } from '../workOrderCrud';
import type { SprayWorkOrder } from './sprayPlannerPdfExport';

export async function convertSavedWorkOrdersToSprayFormat(
  workOrders: SavedWorkOrder[],
): Promise<SprayWorkOrder[]> {
  const allMasterProductIds = [
    ...new Set(
      workOrders.flatMap((wo) =>
        wo.lines.filter((l) => l.master_product_id).map((l) => l.master_product_id!)
      )
    ),
  ];

  let epaMap = new Map<string, string>();
  if (allMasterProductIds.length > 0) {
    const { data } = await supabase
      .from('individual_chemicals')
      .select('master_product_id, epa_reg_number')
      .in('master_product_id', allMasterProductIds);
    if (data) {
      for (const row of data) {
        if (row.epa_reg_number && row.master_product_id) {
          epaMap.set(row.master_product_id, row.epa_reg_number);
        }
      }
    }
  }

  return workOrders.map((wo) => {
    const totalAcres = wo.total_acreage;
    const sprayVol = wo.spray_volume_gal_per_acre;
    const totalSprayVol = sprayVol !== null ? sprayVol * totalAcres : null;

    const chemTotals = wo.lines
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => {
        const epaReg = line.master_product_id ? epaMap.get(line.master_product_id) ?? null : null;
        const totalRaw = line.total_needed;
        const practical = toBestPracticalUnit(totalRaw, line.rate_unit);

        return {
          chemicalId: line.master_product_id ?? line.id,
          chemicalName: line.chemical_name,
          epaRegNumber: epaReg,
          ratePerAcre: line.rate_per_acre,
          rateUnit: line.rate_unit,
          totalDisplay: practical.display,
          totalValue: practical.value,
          totalUnit: practical.unit,
          totalRaw,
          itemNotes: null,
        };
      });

    const fields = wo.fields.map((f) => ({
      fieldId: f.field_id ?? f.id,
      fieldName: f.field_name,
      acreage: f.acreage,
      chemicals: chemTotals.map((ct) => ({
        chemicalId: ct.chemicalId,
        chemicalName: ct.chemicalName,
        epaRegNumber: ct.epaRegNumber,
        ratePerAcre: ct.ratePerAcre,
        rateUnit: ct.rateUnit,
        totalDisplay: toBestPracticalUnit(ct.ratePerAcre * f.acreage, ct.rateUnit).display,
        itemNotes: null,
      })),
    }));

    return {
      programId: wo.program_id ?? wo.id,
      programName: wo.program_name,
      cropType: wo.crop_type,
      applicationCostPerAcre: 0,
      chemicalCostPerAcre: 0,
      totalAcres,
      effectiveAcres: totalAcres,
      sprayVolumeGalPerAcre: sprayVol,
      totalSprayVolumeGal: totalSprayVol,
      fields,
      chemTotals,
    };
  });
}

