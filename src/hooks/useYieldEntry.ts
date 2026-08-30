import { useEffect, useState, useRef, useCallback } from 'react';
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
  field_cost?: { total_cost_per_acre: number };
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
        const fieldYield = yieldsMap.get(field.id);
        const fieldCost = costsMap.get(field.id);

        if (fieldYield && fieldYield.yield_bushels_per_acre > 0) {
          const pricePerBushel = seasonData[`${field.crop_type}_price_per_bushel` as keyof Season] as number | null;
          const { grossRevenue, profit } = calculateProfitMetrics(fieldYield.yield_bushels_per_acre, pricePerBushel, fieldCost?.total_cost_per_acre || null);
          return { ...field, yield: { ...fieldYield, gross_revenue_per_acre: grossRevenue, profit_per_acre: profit }, field_cost: fieldCost };
        }
        return { ...field, yield: fieldYield, field_cost: fieldCost };
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
    setSaveStatus(prev => ({ ...prev, [field.id]: 'saving' }));
    try {
      const yieldData = {
        field_id: field.id, user_id: user.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
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
      const updatedField = { ...field, yield: { ...field.yield, ...updates } };
      if (updatedField.yield.yield_bushels_per_acre > 0) scheduleAutosave(updatedField);
      return updatedField;
    }));
  };

  const saveYield = async (field: FieldWithYield) => {
    if (!field.yield || field.yield.yield_bushels_per_acre <= 0) { alert('Please enter a valid yield'); return; }
    setSaving(field.id);
    try {
      const yieldData = {
        field_id: field.id, user_id: user!.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
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
