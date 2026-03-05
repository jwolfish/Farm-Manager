import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SeasonSummary, CropSummary, CostBreakdown, FieldPerformanceSummary, SaleRecord } from '../lib/reportTypes';
import { CropType } from '../lib/database.types';
import { safeDivide } from '../lib/mathUtils';

interface RawField {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  land_rent_per_acre: number;
  property_tax_per_acre: number;
  field_costs: RawFieldCost[];
  field_yields: RawFieldYield[];
}

interface RawFieldCost {
  seed_cost_per_acre: number;
  fertilizer_cost_per_acre: number;
  chemical_cost_per_acre: number;
  tillage_cost_per_acre: number;
  planting_cost_per_acre: number;
  harvest_cost_per_acre: number;
  equipment_cost_per_acre: number;
  custom_services_cost_per_acre: number;
  labor_cost_per_acre: number;
  crop_insurance_cost_per_acre: number;
  drying_storage_cost_per_acre: number;
  hauling_cost_per_acre: number;
  other_expenses_per_acre: number;
  total_cost_per_acre: number;
}

interface RawFieldYield {
  yield_bushels_per_acre: number;
  total_yield_bushels: number;
}

interface RawSeason {
  id: string;
  name: string;
  year: number;
  corn_price_per_bushel: number | null;
  soybeans_price_per_bushel: number | null;
  wheat_price_per_bushel: number | null;
}

interface RawSale {
  crop_type: CropType;
  bushels_sold: number;
  price_per_bushel: number;
  total_revenue: number;
}

function emptyCostBreakdown(): CostBreakdown {
  return {
    seed: 0, fertilizer: 0, chemical: 0, tillage: 0, planting: 0,
    harvest: 0, equipment: 0, customServices: 0, labor: 0,
    cropInsurance: 0, dryingStorage: 0, hauling: 0, landRent: 0,
    propertyTax: 0, other: 0,
  };
}

function getPriceForCrop(crop: CropType, season: RawSeason): number | null {
  if (crop === 'corn') return season.corn_price_per_bushel;
  if (crop === 'soybeans') return season.soybeans_price_per_bushel;
  if (crop === 'wheat') return season.wheat_price_per_bushel;
  return null;
}

function buildSeasonSummary(
  season: RawSeason,
  fields: RawField[],
  sales: RawSale[]
): SeasonSummary {
  const cropTypes: CropType[] = ['corn', 'soybeans', 'wheat'];
  const cropBreakdown: CropSummary[] = [];

  for (const cropType of cropTypes) {
    const cropFields = fields.filter((f) => f.crop_type === cropType);
    if (cropFields.length === 0) continue;

    const totalAcres = cropFields.reduce((sum, f) => sum + f.acreage, 0);
    const breakdown = emptyCostBreakdown();
    let weightedCostTotal = 0;
    let totalYieldBushels = 0;
    let acresWithYield = 0;

    for (const field of cropFields) {
      const cost = Array.isArray(field.field_costs) ? field.field_costs[0] : field.field_costs;
      if (cost) {
        breakdown.seed += cost.seed_cost_per_acre * field.acreage;
        breakdown.fertilizer += cost.fertilizer_cost_per_acre * field.acreage;
        breakdown.chemical += cost.chemical_cost_per_acre * field.acreage;
        breakdown.tillage += cost.tillage_cost_per_acre * field.acreage;
        breakdown.planting += cost.planting_cost_per_acre * field.acreage;
        breakdown.harvest += cost.harvest_cost_per_acre * field.acreage;
        breakdown.equipment += cost.equipment_cost_per_acre * field.acreage;
        breakdown.customServices += cost.custom_services_cost_per_acre * field.acreage;
        breakdown.labor += cost.labor_cost_per_acre * field.acreage;
        breakdown.cropInsurance += cost.crop_insurance_cost_per_acre * field.acreage;
        breakdown.dryingStorage += cost.drying_storage_cost_per_acre * field.acreage;
        breakdown.hauling += cost.hauling_cost_per_acre * field.acreage;
        breakdown.other += cost.other_expenses_per_acre * field.acreage;
        weightedCostTotal += cost.total_cost_per_acre * field.acreage;
      }
      breakdown.landRent += field.land_rent_per_acre * field.acreage;
      breakdown.propertyTax += field.property_tax_per_acre * field.acreage;
      weightedCostTotal += (field.land_rent_per_acre + field.property_tax_per_acre) * field.acreage;

      const yieldRecord = Array.isArray(field.field_yields) ? field.field_yields[0] : field.field_yields;
      if (yieldRecord) {
        totalYieldBushels += yieldRecord.total_yield_bushels;
        acresWithYield += field.acreage;
      }
    }

    const costPerAcre = safeDivide(weightedCostTotal, totalAcres);
    const yieldPerAcre = acresWithYield > 0 ? safeDivide(totalYieldBushels, acresWithYield) : null;

    const cropSales = sales.filter((s) => s.crop_type === cropType);
    const seasonPrice = getPriceForCrop(cropType, season);

    let totalRevenue: number = 0;
    let priceUsed: number | null = null;

    if (cropSales.length > 0) {
      totalRevenue = cropSales.reduce((sum, s) => sum + s.total_revenue, 0);
      const totalBushelsSold = cropSales.reduce((sum, s) => sum + s.bushels_sold, 0);
      priceUsed = totalBushelsSold > 0
        ? safeDivide(cropSales.reduce((sum, s) => sum + s.price_per_bushel * s.bushels_sold, 0), totalBushelsSold)
        : null;
    } else if (yieldPerAcre !== null && seasonPrice) {
      totalRevenue = totalYieldBushels * seasonPrice;
      priceUsed = seasonPrice;
    }

    const revenuePerAcre = safeDivide(totalRevenue, totalAcres);
    const totalCost = weightedCostTotal;
    const netProfit = totalRevenue - totalCost;

    cropBreakdown.push({
      cropType,
      acres: totalAcres,
      revenuePerAcre,
      costPerAcre,
      netProfitPerAcre: safeDivide(netProfit, totalAcres),
      totalRevenue,
      totalCost,
      totalNetProfit: netProfit,
      yieldPerAcre,
      pricePerBushel: priceUsed,
      costBreakdown: breakdown,
    });
  }

  const totalRevenue = cropBreakdown.reduce((s, c) => s + c.totalRevenue, 0);
  const totalCost = cropBreakdown.reduce((s, c) => s + c.totalCost, 0);
  const totalAcres = cropBreakdown.reduce((s, c) => s + c.acres, 0);

  return {
    seasonId: season.id,
    seasonName: season.name,
    year: season.year,
    cropBreakdown,
    totalRevenue,
    totalCost,
    totalNetProfit: totalRevenue - totalCost,
    totalAcres,
  };
}

function buildFieldPerformance(
  season: RawSeason,
  fields: RawField[],
  sales: RawSale[]
): FieldPerformanceSummary[] {
  return fields.map((field) => {
    const cost = Array.isArray(field.field_costs) ? field.field_costs[0] : field.field_costs;
    const yieldRecord = Array.isArray(field.field_yields) ? field.field_yields[0] : field.field_yields;

    const breakdown: CostBreakdown = {
      seed: cost?.seed_cost_per_acre ?? 0,
      fertilizer: cost?.fertilizer_cost_per_acre ?? 0,
      chemical: cost?.chemical_cost_per_acre ?? 0,
      tillage: cost?.tillage_cost_per_acre ?? 0,
      planting: cost?.planting_cost_per_acre ?? 0,
      harvest: cost?.harvest_cost_per_acre ?? 0,
      equipment: cost?.equipment_cost_per_acre ?? 0,
      customServices: cost?.custom_services_cost_per_acre ?? 0,
      labor: cost?.labor_cost_per_acre ?? 0,
      cropInsurance: cost?.crop_insurance_cost_per_acre ?? 0,
      dryingStorage: cost?.drying_storage_cost_per_acre ?? 0,
      hauling: cost?.hauling_cost_per_acre ?? 0,
      landRent: field.land_rent_per_acre,
      propertyTax: field.property_tax_per_acre,
      other: cost?.other_expenses_per_acre ?? 0,
    };

    const costPerAcre = cost
      ? cost.total_cost_per_acre + field.land_rent_per_acre + field.property_tax_per_acre
      : field.land_rent_per_acre + field.property_tax_per_acre;
    const totalCost = costPerAcre * field.acreage;

    const yieldPerAcre = yieldRecord?.yield_bushels_per_acre ?? null;
    const totalYield = yieldRecord?.total_yield_bushels ?? null;

    const seasonPrice = getPriceForCrop(field.crop_type, season);
    const cropSales = sales.filter((s) => s.crop_type === field.crop_type);
    let revenuePerAcre: number | null = null;
    let totalRevenue: number | null = null;

    if (cropSales.length > 0 && field.acreage > 0) {
      const allRevenue = cropSales.reduce((s, c) => s + c.total_revenue, 0);
      const cropFields = fields.filter((f) => f.crop_type === field.crop_type);
      const totalCropAcres = cropFields.reduce((s, f) => s + f.acreage, 0);
      if (totalCropAcres > 0) {
        const share = safeDivide(field.acreage, totalCropAcres);
        totalRevenue = allRevenue * share;
        revenuePerAcre = safeDivide(totalRevenue, field.acreage);
      }
    } else if (yieldPerAcre !== null && seasonPrice) {
      totalRevenue = (totalYield ?? 0) * seasonPrice;
      revenuePerAcre = yieldPerAcre * seasonPrice;
    }

    const netProfitPerAcre = revenuePerAcre !== null ? revenuePerAcre - costPerAcre : null;
    const totalNetProfit = totalRevenue !== null ? totalRevenue - totalCost : null;

    return {
      fieldId: field.id,
      fieldName: field.name,
      cropType: field.crop_type,
      acres: field.acreage,
      seasonId: season.id,
      seasonName: season.name,
      year: season.year,
      costPerAcre,
      totalCost,
      yieldPerAcre,
      totalYield,
      revenuePerAcre,
      totalRevenue,
      netProfitPerAcre,
      totalNetProfit,
      costBreakdown: breakdown,
    };
  });
}

export function useReportData(userId: string | undefined) {
  const [data, setData] = useState<SeasonSummary[]>([]);
  const [fieldData, setFieldData] = useState<FieldPerformanceSummary[]>([]);
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [userId]);

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: seasons, error: seasonsError } = await supabase
        .from('seasons')
        .select('id, name, year, corn_price_per_bushel, soybeans_price_per_bushel, wheat_price_per_bushel')
        .eq('user_id', userId)
        .order('year', { ascending: true });

      if (seasonsError) throw seasonsError;
      if (!seasons || seasons.length === 0) {
        setData([]);
        setFieldData([]);
        setSalesData([]);
        return;
      }

      const seasonIds = seasons.map((s) => s.id);

      const [fieldsResults, salesResults] = await Promise.all([
        Promise.all(
          seasonIds.map((seasonId) =>
            supabase
              .from('fields')
              .select(`
                id, name, crop_type, acreage, land_rent_per_acre, property_tax_per_acre,
                field_costs (
                  seed_cost_per_acre, fertilizer_cost_per_acre, chemical_cost_per_acre,
                  tillage_cost_per_acre, planting_cost_per_acre, harvest_cost_per_acre,
                  equipment_cost_per_acre, custom_services_cost_per_acre, labor_cost_per_acre,
                  crop_insurance_cost_per_acre, drying_storage_cost_per_acre, hauling_cost_per_acre,
                  other_expenses_per_acre, total_cost_per_acre
                ),
                field_yields (
                  yield_bushels_per_acre, total_yield_bushels
                )
              `)
              .eq('season_id', seasonId)
              .eq('user_id', userId)
          )
        ),
        Promise.all(
          seasonIds.map((seasonId) =>
            supabase
              .from('commodity_sales')
              .select('id, crop_type, bushels_sold, price_per_bushel, total_revenue, sale_date, delivery_month, destination, notes')
              .eq('season_id', seasonId)
              .eq('user_id', userId)
              .order('sale_date', { ascending: true })
          )
        ),
      ]);

      const summaries: SeasonSummary[] = [];
      const allFields: FieldPerformanceSummary[] = [];
      const allSales: SaleRecord[] = [];

      for (let i = 0; i < seasons.length; i++) {
        const season = seasons[i];
        const fieldsResult = fieldsResults[i];
        const salesResult = salesResults[i];

        if (fieldsResult.error) throw fieldsResult.error;
        if (salesResult.error) throw salesResult.error;

        const typedFields = (fieldsResult.data || []) as unknown as RawField[];
        const typedSales = (salesResult.data || []) as (RawSale & { id: string; sale_date: string; delivery_month: string; destination: string; notes: string | null })[];

        const summary = buildSeasonSummary(season as RawSeason, typedFields, typedSales);
        summaries.push(summary);

        const fieldSummaries = buildFieldPerformance(season as RawSeason, typedFields, typedSales);
        allFields.push(...fieldSummaries);

        for (const s of typedSales) {
          allSales.push({
            id: s.id,
            seasonId: season.id,
            seasonName: season.name,
            year: season.year,
            cropType: s.crop_type,
            saleDate: s.sale_date,
            deliveryMonth: s.delivery_month,
            destination: s.destination,
            bushelsSold: s.bushels_sold,
            pricePerBushel: s.price_per_bushel,
            totalRevenue: s.total_revenue,
            notes: s.notes,
          });
        }
      }

      setData(summaries);
      setFieldData(allFields);
      setSalesData(allSales);
    } catch (err: any) {
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  return { data, fieldData, salesData, loading, error, reload: loadData };
}
