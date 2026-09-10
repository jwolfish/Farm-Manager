import { useEffect, useState, useRef, useCallback } from 'react';
import { isHarvestedRow } from '../lib/harvestProgress';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CropType } from '../lib/database.types';

export interface FieldYield {
  id?: string;
  field_id: string;
  yield_bushels_per_acre: number;
  total_yield_bushels: number;
  harvest_date: string | null;
  moisture_percentage: number | null;
  notes: string;
  /**
   * H-5. The planning estimate, and the stamp that says this field has actually been cut.
   *
   * This screen owns the estimate and must not touch a measured actual: `harvested_at` is
   * set by the harvest tracker and by nothing else, and where it is set the number in
   * `yield_bushels_per_acre` came off a monitor rather than out of a forecast. See the
   * refusal in `autosaveYield`.
   */
  estimated_yield_bushels_per_acre?: number | null;
  harvested_at?: string | null;
}

export interface FieldYieldWithCalculations extends FieldYield {
  gross_revenue_per_acre: number | null;
  profit_per_acre: number | null;
}

export interface FieldWithYield {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  yield?: FieldYieldWithCalculations;
  /**
   * `field_costs.total_cost_per_acre` is nullable — a field whose costs have never been
   * computed has no total. This interface declared it non-null, which is the hand-written-
   * interface-against-the-schema drift WI-19 keeps finding. A null here means "no cost yet",
   * and must not be read as a cost of zero.
   */
  field_cost?: { total_cost_per_acre: number | null };
}

export interface Season {
  id: string;
  corn_price_per_bushel: number | null;
  soybeans_price_per_bushel: number | null;
  wheat_price_per_bushel: number | null;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function calculateProfitMetrics(yieldPerAcre: number, pricePerBushel: number | null, costPerAcre: number | null) {
  const grossRevenue = pricePerBushel && yieldPerAcre > 0 ? yieldPerAcre * pricePerBushel : null;
  const profit = grossRevenue !== null && costPerAcre !== null ? grossRevenue - costPerAcre : null;
  return { grossRevenue, profit };
}

export function useYieldEntry(seasonId: string | null) {
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldWithYield[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [loadingSalesAvg, setLoadingSalesAvg] = useState<Record<string, boolean>>({});
  const [priceInputs, setPriceInputs] = useState({ corn: '', soybeans: '', wheat: '' });
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => { Object.values(autosaveTimers.current).forEach(timer => clearTimeout(timer)); };
  }, []);

  const getSeasonPrice = (cropType: CropType): number | null => {
    if (!season) return null;
    if (cropType === 'corn') return season.corn_price_per_bushel;
    if (cropType === 'soybeans') return season.soybeans_price_per_bushel;
    if (cropType === 'wheat') return season.wheat_price_per_bushel;
    return null;
  };

  const loadFieldsAndYields = useCallback(async () => {
    if (!seasonId || !user) return;
    try {
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id, corn_price_per_bushel, soybeans_price_per_bushel, wheat_price_per_bushel')
        .eq('id', seasonId)
        .maybeSingle();

      if (seasonError) throw seasonError;
      if (!seasonData) { setFields([]); setSeason(null); return; }
      setSeason(seasonData);
      setPriceInputs({
        corn: seasonData.corn_price_per_bushel !== null ? seasonData.corn_price_per_bushel.toFixed(2) : '',
        soybeans: seasonData.soybeans_price_per_bushel !== null ? seasonData.soybeans_price_per_bushel.toFixed(2) : '',
        wheat: seasonData.wheat_price_per_bushel !== null ? seasonData.wheat_price_per_bushel.toFixed(2) : '',
      });

      const { data: fieldsData, error: fieldsError } = await supabase
        .from('fields').select('id, name, crop_type, acreage')
        .eq('season_id', seasonId).order('name');
      if (fieldsError) throw fieldsError;

      const fieldIds = (fieldsData || []).map(f => f.id);

      const [{ data: yieldsData, error: yieldsError }, { data: costsData, error: costsError }] = await Promise.all([
        supabase.from('field_yields').select('*').in('field_id', fieldIds),
        supabase.from('field_costs').select('field_id, total_cost_per_acre').in('field_id', fieldIds),
      ]);

      if (yieldsError) throw yieldsError;
      if (costsError) throw costsError;

      const yieldsMap = new Map(yieldsData?.map(y => [y.field_id, y]) || []);
      const costsMap = new Map(costsData?.map(c => [c.field_id, { total_cost_per_acre: c.total_cost_per_acre }]) || []);

      const enrichedFields: FieldWithYield[] = (fieldsData || []).map(field => {
        const row = yieldsMap.get(field.id);
        const fieldCost = costsMap.get(field.id);

        if (!row) return { ...field, yield: undefined, field_cost: fieldCost };

        /*
         * Mapped column by column rather than spread.
         *
         * The row that comes back is the database's shape and this interface is not: `notes`
         * is nullable in Postgres and non-null here, which the compiler had been reporting
         * as a TS2322 inside the baseline the whole time. Spreading a row into a stricter
         * interface is how that goes unnoticed; naming the columns is how the next added
         * one gets noticed.
         */
        const priced = row.yield_bushels_per_acre > 0;
        const pricePerBushel = priced
          ? (seasonData[`${field.crop_type}_price_per_bushel` as keyof Season] as number | null)
          : null;
        const { grossRevenue, profit } = priced
          ? calculateProfitMetrics(row.yield_bushels_per_acre, pricePerBushel, fieldCost?.total_cost_per_acre ?? null)
          : { grossRevenue: null, profit: null };

        return {
          ...field,
          yield: {
            id: row.id,
            field_id: row.field_id,
            yield_bushels_per_acre: row.yield_bushels_per_acre,
            total_yield_bushels: row.total_yield_bushels,
            harvest_date: row.harvest_date,
            moisture_percentage: row.moisture_percentage,
            notes: row.notes ?? '',
            estimated_yield_bushels_per_acre: row.estimated_yield_bushels_per_acre,
            harvested_at: row.harvested_at,
            gross_revenue_per_acre: grossRevenue,
            profit_per_acre: profit,
          },
          field_cost: fieldCost,
        };
      });

      setFields(enrichedFields);
    } catch (error) {
      console.error('Error loading fields and yields:', error);
    } finally {
      setLoading(false);
    }
  }, [seasonId, user]);

  useEffect(() => { if (seasonId && user) loadFieldsAndYields(); }, [seasonId, user, loadFieldsAndYields]);

  const updateSeasonPrice = async (cropType: CropType, price: number | null) => {
    if (!seasonId || !season) return;
    try {
      const updateData: Record<string, number | null> = {};
      if (cropType === 'corn') updateData.corn_price_per_bushel = price;
      if (cropType === 'soybeans') updateData.soybeans_price_per_bushel = price;
      if (cropType === 'wheat') updateData.wheat_price_per_bushel = price;

      const { error } = await supabase.from('seasons').update(updateData).eq('id', seasonId);
      if (error) throw error;

      setSeason(prev => prev ? { ...prev, ...updateData } : null);
      setFields(prevFields => prevFields.map(field => {
        if (field.crop_type === cropType && field.yield) {
          const { grossRevenue, profit } = calculateProfitMetrics(field.yield.yield_bushels_per_acre, price, field.field_cost?.total_cost_per_acre || null);
          return { ...field, yield: { ...field.yield, gross_revenue_per_acre: grossRevenue, profit_per_acre: profit } };
        }
        return field;
      }));
    } catch (error) {
      console.error('Error updating season price:', error);
      alert('Error updating price. Please try again.');
    }
  };

  const handlePriceInputChange = (cropType: CropType, value: string) => {
    setPriceInputs(prev => ({ ...prev, [cropType]: value }));
  };

  const handlePriceInputBlur = async (cropType: CropType) => {
    const value = priceInputs[cropType];
    const price = value ? parseFloat(value) : null;
    if (price !== null && !isNaN(price)) {
      setPriceInputs(prev => ({ ...prev, [cropType]: price.toFixed(2) }));
      await updateSeasonPrice(cropType, price);
    } else if (value === '') {
      await updateSeasonPrice(cropType, null);
    }
  };

  const fetchSalesAverage = async (cropType: CropType) => {
    if (!seasonId || !user) return;
    setLoadingSalesAvg(prev => ({ ...prev, [cropType]: true }));
    try {
      const { data, error } = await supabase
        .from('commodity_sales').select('bushels_sold, price_per_bushel')
        .eq('season_id', seasonId).eq('crop_type', cropType);
      if (error) throw error;
      if (!data || data.length === 0) { alert(`No ${cropType} sales recorded for this season.`); return; }
      const totalBushels = data.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
      const weightedSum = data.reduce((sum, s) => sum + Number(s.bushels_sold) * Number(s.price_per_bushel), 0);
      const avgPrice = totalBushels > 0 ? weightedSum / totalBushels : 0;
      if (avgPrice > 0) {
        setPriceInputs(prev => ({ ...prev, [cropType]: avgPrice.toFixed(2) }));
        await updateSeasonPrice(cropType, avgPrice);
      }
    } catch (error) {
      console.error('Error fetching sales average:', error);
      alert('Error fetching sales average. Please try again.');
    } finally {
      setLoadingSalesAvg(prev => ({ ...prev, [cropType]: false }));
    }
  };

  const autosaveYield = useCallback(async (field: FieldWithYield) => {
    if (!user || !field.yield || field.yield.yield_bushels_per_acre <= 0) return;
    /*
     * H-5. The guard that matters, and it is here rather than only on the input.
     *
     * This autosave fires 1.5 s after a keystroke with no notion of what is already in the
     * row. A cursor left in a yield box on a harvested field would quietly replace a
     * measured number with a typed one, and afterwards nothing on any screen would tell
     * them apart. Disabling the input is the affordance; this is the writer.
     */
    if (isHarvestedRow(field.yield)) return;
    setSaveStatus(prev => ({ ...prev, [field.id]: 'saving' }));
    try {
      const yieldData = {
        field_id: field.id, user_id: user.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        // This screen is the estimate's editor, so both move together while the field is
        // standing. Letting the estimate go stale would put an old number into "estimated
        // to go" on the harvest screen.
        estimated_yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        total_yield_bushels: field.yield.total_yield_bushels,
        harvest_date: field.yield.harvest_date || null,
        moisture_percentage: field.yield.moisture_percentage || null,
        notes: field.yield.notes || '',
      };
      if (field.yield.id) {
        const { error } = await supabase.from('field_yields').update(yieldData).eq('id', field.yield.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('field_yields').insert([yieldData]).select().single();
        if (error) throw error;
        setFields(prevFields => prevFields.map(f =>
          f.id === field.id && f.yield ? { ...f, yield: { ...f.yield, id: data.id } } : f
        ));
      }
      setSaveStatus(prev => ({ ...prev, [field.id]: 'saved' }));
      setTimeout(() => { setSaveStatus(prev => ({ ...prev, [field.id]: 'idle' })); }, 2000);
    } catch (error) {
      console.error('Error autosaving yield:', error);
      setSaveStatus(prev => ({ ...prev, [field.id]: 'error' }));
    }
  }, [user?.id]);

  const scheduleAutosave = useCallback((field: FieldWithYield) => {
    if (autosaveTimers.current[field.id]) clearTimeout(autosaveTimers.current[field.id]);
    autosaveTimers.current[field.id] = setTimeout(() => { autosaveYield(field); }, 1500);
  }, [autosaveYield]);

  const handleYieldChange = (fieldId: string, yieldPerAcre: number) => {
    setFields(prevFields => prevFields.map(field => {
      if (field.id !== fieldId) return field;
      if (isHarvestedRow(field.yield)) return field;
      const totalYield = yieldPerAcre * field.acreage;
      const pricePerBushel = getSeasonPrice(field.crop_type);
      const { grossRevenue, profit } = calculateProfitMetrics(yieldPerAcre, pricePerBushel, field.field_cost?.total_cost_per_acre || null);
      const updatedField = {
        ...field,
        yield: {
          ...(field.yield || { field_id: fieldId, yield_bushels_per_acre: 0, total_yield_bushels: 0, harvest_date: null, moisture_percentage: null, notes: '' }),
          yield_bushels_per_acre: yieldPerAcre,
          total_yield_bushels: totalYield,
          gross_revenue_per_acre: grossRevenue,
          profit_per_acre: profit,
        },
      };
      scheduleAutosave(updatedField);
      return updatedField;
    }));
  };

  const handleFieldUpdate = (fieldId: string, updates: Partial<FieldYield>) => {
    setFields(prevFields => prevFields.map(field => {
      if (field.id !== fieldId || !field.yield) return field;
      if (isHarvestedRow(field.yield)) return field;
      const updatedField = { ...field, yield: { ...field.yield, ...updates } };
      if (updatedField.yield.yield_bushels_per_acre > 0) scheduleAutosave(updatedField);
      return updatedField;
    }));
  };

  const saveYield = async (field: FieldWithYield) => {
    if (!field.yield || field.yield.yield_bushels_per_acre <= 0) { alert('Please enter a valid yield'); return; }
    if (isHarvestedRow(field.yield)) {
      alert('This field has been harvested. Change the measured yield on the Harvest page.');
      return;
    }
    setSaving(field.id);
    try {
      const yieldData = {
        field_id: field.id, user_id: user!.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        estimated_yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        total_yield_bushels: field.yield.total_yield_bushels,
        harvest_date: field.yield.harvest_date || null,
        moisture_percentage: field.yield.moisture_percentage || null,
        notes: field.yield.notes || '',
      };
      if (field.yield.id) {
        const { error } = await supabase.from('field_yields').update(yieldData).eq('id', field.yield.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('field_yields').insert([yieldData]);
        if (error) throw error;
      }
      await loadFieldsAndYields();
      alert('Yield saved successfully!');
    } catch (error) {
      console.error('Error saving yield:', error);
      alert('Error saving yield. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const calculateStats = () => {
    const stats = {
      corn: { count: 0, totalYield: 0, totalAcreage: 0 },
      soybeans: { count: 0, totalYield: 0, totalAcreage: 0 },
      wheat: { count: 0, totalYield: 0, totalAcreage: 0 },
    };
    fields.forEach(field => {
      if (field.yield && field.yield.yield_bushels_per_acre > 0) {
        stats[field.crop_type].count += 1;
        stats[field.crop_type].totalYield += field.yield.total_yield_bushels;
        stats[field.crop_type].totalAcreage += field.acreage;
      }
    });
    return stats;
  };

  return {
    fields, season, loading, saving, saveStatus, loadingSalesAvg, priceInputs,
    handleYieldChange, handleFieldUpdate, saveYield,
    handlePriceInputChange, handlePriceInputBlur, fetchSalesAverage,
    calculateStats,
  };
}
