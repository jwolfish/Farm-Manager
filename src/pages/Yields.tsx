import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Wheat, Save, Calendar, DollarSign, Check, AlertCircle, RefreshCw } from 'lucide-react';
import type { CropType } from '../lib/database.types';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
}

interface FieldYield {
  id?: string;
  field_id: string;
  yield_bushels_per_acre: number;
  total_yield_bushels: number;
  harvest_date: string | null;
  moisture_percentage: number | null;
  notes: string;
}

interface FieldYieldWithCalculations extends FieldYield {
  gross_revenue_per_acre: number | null;
  profit_per_acre: number | null;
}

interface FieldCost {
  total_cost_per_acre: number;
}

interface FieldWithYield extends Field {
  yield?: FieldYieldWithCalculations;
  field_cost?: FieldCost;
}

interface Season {
  id: string;
  corn_price_per_bushel: number | null;
  soybeans_price_per_bushel: number | null;
  wheat_price_per_bushel: number | null;
}

interface YieldsProps {
  seasonId: string | null;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function Yields({ seasonId }: YieldsProps) {
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldWithYield[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');
  const [priceInputs, setPriceInputs] = useState({
    corn: '',
    soybeans: '',
    wheat: '',
  });
  const autosaveTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (seasonId && user) {
      loadFieldsAndYields();
    }
  }, [seasonId, user?.id]);

  useEffect(() => {
    return () => {
      Object.values(autosaveTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  const calculateProfitMetrics = (
    yieldPerAcre: number,
    pricePerBushel: number | null,
    costPerAcre: number | null
  ) => {
    const grossRevenue = pricePerBushel && yieldPerAcre > 0
      ? yieldPerAcre * pricePerBushel
      : null;

    const profit = grossRevenue !== null && costPerAcre !== null
      ? grossRevenue - costPerAcre
      : null;

    return { grossRevenue, profit };
  };

  const loadFieldsAndYields = async () => {
    if (!seasonId || !user) return;

    try {
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id, corn_price_per_bushel, soybeans_price_per_bushel, wheat_price_per_bushel')
        .eq('id', seasonId)
        .single();

      if (seasonError) throw seasonError;
      setSeason(seasonData);

      setPriceInputs({
        corn: seasonData.corn_price_per_bushel !== null ? seasonData.corn_price_per_bushel.toFixed(2) : '',
        soybeans: seasonData.soybeans_price_per_bushel !== null ? seasonData.soybeans_price_per_bushel.toFixed(2) : '',
        wheat: seasonData.wheat_price_per_bushel !== null ? seasonData.wheat_price_per_bushel.toFixed(2) : '',
      });

      const { data: fieldsData, error: fieldsError } = await supabase
        .from('fields')
        .select('id, name, crop_type, acreage')
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('name');

      if (fieldsError) throw fieldsError;

      const { data: yieldsData, error: yieldsError } = await supabase
        .from('field_yields')
        .select('*')
        .eq('user_id', user.id)
        .in('field_id', (fieldsData || []).map(f => f.id));

      if (yieldsError) throw yieldsError;

      const { data: costsData, error: costsError } = await supabase
        .from('field_costs')
        .select('field_id, total_cost_per_acre')
        .eq('user_id', user.id)
        .in('field_id', (fieldsData || []).map(f => f.id));

      if (costsError) throw costsError;

      const yieldsMap = new Map(yieldsData?.map(y => [y.field_id, y]) || []);
      const costsMap = new Map(costsData?.map(c => [c.field_id, { total_cost_per_acre: c.total_cost_per_acre }]) || []);

      const enrichedFields: FieldWithYield[] = (fieldsData || []).map(field => {
        const fieldYield = yieldsMap.get(field.id);
        const fieldCost = costsMap.get(field.id);

        if (fieldYield && fieldYield.yield_bushels_per_acre > 0) {
          const pricePerBushel = seasonData[`${field.crop_type}_price_per_bushel` as keyof Season] as number | null;
          const costPerAcre = fieldCost?.total_cost_per_acre || null;
          const { grossRevenue, profit } = calculateProfitMetrics(
            fieldYield.yield_bushels_per_acre,
            pricePerBushel,
            costPerAcre
          );

          return {
            ...field,
            yield: {
              ...fieldYield,
              gross_revenue_per_acre: grossRevenue,
              profit_per_acre: profit,
            },
            field_cost: fieldCost,
          };
        }

        return {
          ...field,
          yield: fieldYield,
          field_cost: fieldCost,
        };
      });

      setFields(enrichedFields);
    } catch (error) {
      console.error('Error loading fields and yields:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeasonPrice = (cropType: CropType): number | null => {
    if (!season) return null;
    switch (cropType) {
      case 'corn':
        return season.corn_price_per_bushel;
      case 'soybeans':
        return season.soybeans_price_per_bushel;
      case 'wheat':
        return season.wheat_price_per_bushel;
      default:
        return null;
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

  const updateSeasonPrice = async (cropType: CropType, price: number | null) => {
    if (!seasonId || !season) return;

    try {
      const updateData: Record<string, number | null> = {};
      if (cropType === 'corn') updateData.corn_price_per_bushel = price;
      if (cropType === 'soybeans') updateData.soybeans_price_per_bushel = price;
      if (cropType === 'wheat') updateData.wheat_price_per_bushel = price;

      const { error } = await supabase
        .from('seasons')
        .update(updateData)
        .eq('id', seasonId);

      if (error) throw error;

      setSeason(prev => prev ? { ...prev, ...updateData } : null);

      setFields(prevFields =>
        prevFields.map(field => {
          if (field.crop_type === cropType && field.yield) {
            const yieldPerAcre = field.yield.yield_bushels_per_acre;
            const costPerAcre = field.field_cost?.total_cost_per_acre || null;
            const { grossRevenue, profit } = calculateProfitMetrics(yieldPerAcre, price, costPerAcre);

            return {
              ...field,
              yield: {
                ...field.yield,
                gross_revenue_per_acre: grossRevenue,
                profit_per_acre: profit,
              },
            };
          }
          return field;
        })
      );
    } catch (error) {
      console.error('Error updating season price:', error);
      alert('Error updating price. Please try again.');
    }
  };

  const [loadingSalesAvg, setLoadingSalesAvg] = useState<Record<string, boolean>>({});

  const fetchSalesAverage = async (cropType: CropType) => {
    if (!seasonId || !user) return;

    setLoadingSalesAvg(prev => ({ ...prev, [cropType]: true }));
    try {
      const { data, error } = await supabase
        .from('commodity_sales')
        .select('bushels_sold, price_per_bushel')
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .eq('crop_type', cropType);

      if (error) throw error;

      if (!data || data.length === 0) {
        alert(`No ${cropType} sales recorded for this season.`);
        return;
      }

      const totalBushels = data.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
      const weightedSum = data.reduce((sum, s) => sum + Number(s.bushels_sold) * Number(s.price_per_bushel), 0);
      const avgPrice = totalBushels > 0 ? weightedSum / totalBushels : 0;

      if (avgPrice > 0) {
        const formatted = avgPrice.toFixed(2);
        setPriceInputs(prev => ({ ...prev, [cropType]: formatted }));
        await updateSeasonPrice(cropType, avgPrice);
      }
    } catch (error) {
      console.error('Error fetching sales average:', error);
      alert('Error fetching sales average. Please try again.');
    } finally {
      setLoadingSalesAvg(prev => ({ ...prev, [cropType]: false }));
    }
  };

  const handleYieldChange = (fieldId: string, yieldPerAcre: number) => {
    setFields(prevFields => {
      const updatedFields = prevFields.map(field => {
        if (field.id === fieldId) {
          const totalYield = yieldPerAcre * field.acreage;
          const pricePerBushel = getSeasonPrice(field.crop_type);
          const costPerAcre = field.field_cost?.total_cost_per_acre || null;
          const { grossRevenue, profit } = calculateProfitMetrics(yieldPerAcre, pricePerBushel, costPerAcre);

          const updatedField = {
            ...field,
            yield: {
              ...(field.yield || {
                field_id: fieldId,
                yield_bushels_per_acre: 0,
                total_yield_bushels: 0,
                harvest_date: null,
                moisture_percentage: null,
                notes: '',
              }),
              yield_bushels_per_acre: yieldPerAcre,
              total_yield_bushels: totalYield,
              gross_revenue_per_acre: grossRevenue,
              profit_per_acre: profit,
            },
          };

          scheduleAutosave(updatedField);
          return updatedField;
        }
        return field;
      });
      return updatedFields;
    });
  };

  const handleFieldUpdate = (fieldId: string, updates: Partial<FieldYield>) => {
    setFields(prevFields => {
      const updatedFields = prevFields.map(field => {
        if (field.id === fieldId && field.yield) {
          const updatedYield = { ...field.yield, ...updates };
          const updatedField = {
            ...field,
            yield: updatedYield,
          };

          if (updatedField.yield.yield_bushels_per_acre > 0) {
            scheduleAutosave(updatedField);
          }

          return updatedField;
        }
        return field;
      });
      return updatedFields;
    });
  };

  const autosaveYield = useCallback(async (field: FieldWithYield) => {
    if (!field.yield || field.yield.yield_bushels_per_acre <= 0) {
      return;
    }

    setSaveStatus(prev => ({ ...prev, [field.id]: 'saving' }));

    try {
      const yieldData = {
        field_id: field.id,
        user_id: user!.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        total_yield_bushels: field.yield.total_yield_bushels,
        harvest_date: field.yield.harvest_date || null,
        moisture_percentage: field.yield.moisture_percentage || null,
        notes: field.yield.notes || '',
      };

      if (field.yield.id) {
        const { error } = await supabase
          .from('field_yields')
          .update(yieldData)
          .eq('id', field.yield.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('field_yields')
          .insert([yieldData])
          .select()
          .single();

        if (error) throw error;

        setFields(prevFields =>
          prevFields.map(f =>
            f.id === field.id && f.yield
              ? { ...f, yield: { ...f.yield, id: data.id } }
              : f
          )
        );
      }

      setSaveStatus(prev => ({ ...prev, [field.id]: 'saved' }));

      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [field.id]: 'idle' }));
      }, 2000);
    } catch (error) {
      console.error('Error autosaving yield:', error);
      setSaveStatus(prev => ({ ...prev, [field.id]: 'error' }));
    }
  }, [user?.id]);

  const scheduleAutosave = useCallback((field: FieldWithYield) => {
    if (autosaveTimers.current[field.id]) {
      clearTimeout(autosaveTimers.current[field.id]);
    }

    autosaveTimers.current[field.id] = setTimeout(() => {
      autosaveYield(field);
    }, 1500);
  }, [autosaveYield]);

  const saveYield = async (field: FieldWithYield) => {
    if (!field.yield || field.yield.yield_bushels_per_acre <= 0) {
      alert('Please enter a valid yield');
      return;
    }

    setSaving(field.id);
    try {
      const yieldData = {
        field_id: field.id,
        user_id: user!.id,
        yield_bushels_per_acre: field.yield.yield_bushels_per_acre,
        total_yield_bushels: field.yield.total_yield_bushels,
        harvest_date: field.yield.harvest_date || null,
        moisture_percentage: field.yield.moisture_percentage || null,
        notes: field.yield.notes || '',
      };

      if (field.yield.id) {
        const { error } = await supabase
          .from('field_yields')
          .update(yieldData)
          .eq('id', field.yield.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('field_yields')
          .insert([yieldData]);

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

  const getFilteredFields = () => {
    if (cropFilter === 'all') return fields;
    return fields.filter(f => f.crop_type === cropFilter);
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

  const SaveStatusIndicator = ({ fieldId }: { fieldId: string }) => {
    const status = saveStatus[fieldId] || 'idle';

    if (status === 'idle') return null;

    return (
      <div className="flex items-center gap-2 text-sm">
        {status === 'saving' && (
          <>
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-blue-600 font-medium">Saving...</span>
          </>
        )}
        {status === 'saved' && (
          <>
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-green-600 font-medium">Saved</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-red-600 font-medium">Error saving</span>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  const filteredFields = getFilteredFields();
  const stats = calculateStats();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wheat className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-semibold text-gray-900">Yield Entry</h2>
          </div>
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value as CropType | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="all">All Crops</option>
            <option value="corn">Corn</option>
            <option value="soybeans">Soybeans</option>
            <option value="wheat">Wheat</option>
          </select>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Season Crop Prices</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
              <label className="block text-sm font-medium text-yellow-800 mb-2">
                Corn Price (per bushel)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-yellow-700 font-medium">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceInputs.corn}
                    onChange={(e) => handlePriceInputChange('corn', e.target.value)}
                    onBlur={() => handlePriceInputBlur('corn')}
                    className="w-full pl-8 pr-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                    placeholder="0.00"
                  />
                </div>
                <button
                  onClick={() => fetchSalesAverage('corn')}
                  disabled={loadingSalesAvg.corn}
                  className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5"
                  title="Use weighted average price from Sales Tracking"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSalesAvg.corn ? 'animate-spin' : ''}`} />
                  Sales Avg
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <label className="block text-sm font-medium text-green-800 mb-2">
                Soybeans Price (per bushel)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-green-700 font-medium">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceInputs.soybeans}
                    onChange={(e) => handlePriceInputChange('soybeans', e.target.value)}
                    onBlur={() => handlePriceInputBlur('soybeans')}
                    className="w-full pl-8 pr-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    placeholder="0.00"
                  />
                </div>
                <button
                  onClick={() => fetchSalesAverage('soybeans')}
                  disabled={loadingSalesAvg.soybeans}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5"
                  title="Use weighted average price from Sales Tracking"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSalesAvg.soybeans ? 'animate-spin' : ''}`} />
                  Sales Avg
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
              <label className="block text-sm font-medium text-amber-800 mb-2">
                Wheat Price (per bushel)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-amber-700 font-medium">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceInputs.wheat}
                    onChange={(e) => handlePriceInputChange('wheat', e.target.value)}
                    onBlur={() => handlePriceInputBlur('wheat')}
                    className="w-full pl-8 pr-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                    placeholder="0.00"
                  />
                </div>
                <button
                  onClick={() => fetchSalesAverage('wheat')}
                  disabled={loadingSalesAvg.wheat}
                  className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5"
                  title="Use weighted average price from Sales Tracking"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSalesAvg.wheat ? 'animate-spin' : ''}`} />
                  Sales Avg
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
            <div className="text-sm font-medium text-yellow-800 mb-1">Corn</div>
            <div className="text-2xl font-bold text-yellow-900">
              {stats.corn.totalAcreage > 0
                ? (stats.corn.totalYield / stats.corn.totalAcreage).toFixed(1)
                : '0.0'}
            </div>
            <div className="text-xs text-yellow-700">
              avg bu/acre ({stats.corn.count} field{stats.corn.count !== 1 ? 's' : ''})
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <div className="text-sm font-medium text-green-800 mb-1">Soybeans</div>
            <div className="text-2xl font-bold text-green-900">
              {stats.soybeans.totalAcreage > 0
                ? (stats.soybeans.totalYield / stats.soybeans.totalAcreage).toFixed(1)
                : '0.0'}
            </div>
            <div className="text-xs text-green-700">
              avg bu/acre ({stats.soybeans.count} field{stats.soybeans.count !== 1 ? 's' : ''})
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
            <div className="text-sm font-medium text-amber-800 mb-1">Wheat</div>
            <div className="text-2xl font-bold text-amber-900">
              {stats.wheat.totalAcreage > 0
                ? (stats.wheat.totalYield / stats.wheat.totalAcreage).toFixed(1)
                : '0.0'}
            </div>
            <div className="text-xs text-amber-700">
              avg bu/acre ({stats.wheat.count} field{stats.wheat.count !== 1 ? 's' : ''})
            </div>
          </div>
        </div>

        {filteredFields.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No fields found. Create fields first.</p>
        ) : (
          <div className="space-y-4">
            {filteredFields.map((field) => (
              <div key={field.id} className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{field.name}</h3>
                        <p className="text-sm text-gray-600">
                          {field.crop_type} • {field.acreage} acres
                        </p>
                      </div>
                      <SaveStatusIndicator fieldId={field.id} />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Yield (bushels per acre) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={field.yield?.yield_bushels_per_acre || ''}
                          onChange={(e) =>
                            handleYieldChange(field.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Enter yield"
                        />
                      </div>

                      {field.yield && field.yield.yield_bushels_per_acre > 0 && (
                        <div className="space-y-2">
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <span className="text-sm font-medium text-gray-700">Total Yield: </span>
                            <span className="text-lg font-bold text-blue-700">
                              {field.yield.total_yield_bushels.toFixed(1)} bushels
                            </span>
                          </div>

                          {field.yield.gross_revenue_per_acre !== null && (
                            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                              <span className="text-sm font-medium text-gray-700">Revenue/Acre: </span>
                              <span className="text-lg font-bold text-green-700">
                                ${field.yield.gross_revenue_per_acre.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {field.yield.profit_per_acre !== null && field.field_cost && (
                            <div className={`p-3 rounded-lg border ${
                              field.yield.profit_per_acre >= 0
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Profit/Acre: </span>
                                <span className={`text-lg font-bold ${
                                  field.yield.profit_per_acre >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  ${field.yield.profit_per_acre.toFixed(2)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                Cost/Acre: ${field.field_cost.total_cost_per_acre.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-4">
                      Additional Information (Optional)
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          Harvest Date
                        </label>
                        <input
                          type="date"
                          value={field.yield?.harvest_date || ''}
                          onChange={(e) =>
                            handleFieldUpdate(field.id, { harvest_date: e.target.value || null })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Moisture %
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={field.yield?.moisture_percentage || ''}
                          onChange={(e) =>
                            handleFieldUpdate(field.id, {
                              moisture_percentage: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="e.g., 15.5"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                        <textarea
                          value={field.yield?.notes || ''}
                          onChange={(e) => handleFieldUpdate(field.id, { notes: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Any notes about this harvest..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => saveYield(field)}
                    disabled={
                      saving === field.id ||
                      saveStatus[field.id] === 'saving' ||
                      !field.yield ||
                      field.yield.yield_bushels_per_acre <= 0
                    }
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving === field.id ? 'Saving...' : 'Save Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
