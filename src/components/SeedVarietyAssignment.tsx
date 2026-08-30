import { useEffect, useState, useMemo } from 'react';
import { X, Sprout, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { CropType } from '../lib/database.types';
import type { SeedVarietyAssignment } from '../lib/templateUtils';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
}

interface SeedVariety {
  id: string;
  product_name: string;
  crop_type: CropType;
  price_per_unit: number;
  unit_type: string;
  standard_seeding_rate: number | null;
  units_per_bag: number | null;
}

interface SeedVarietyAssignmentProps {
  seasonId: string;
  userId: string;
  selectedFields: Field[];
  onBack: () => void;
  onContinue: (assignments: SeedVarietyAssignment[]) => void;
}

interface FieldAssignment {
  seedVarietyId: string;
  seedingRate: string;
  seedCostPerAcre: number;
}

export function SeedVarietyAssignmentComponent({
  seasonId,
  userId,
  selectedFields,
  onBack,
  onContinue
}: SeedVarietyAssignmentProps) {
  const [seedVarieties, setSeedVarieties] = useState<SeedVariety[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Map<string, FieldAssignment>>(new Map());
  const [expandedCropTypes, setExpandedCropTypes] = useState<Set<CropType>>(new Set());
  const [errors, setErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSeedVarieties = async () => {
      try {
        const { data, error } = await supabase
          .from('seed_varieties')
          .select('*')
          .eq('season_id', seasonId)
          .order('product_name');

        if (error) throw error;
        setSeedVarieties(data || []);
      } catch (error) {
        console.error('Error loading seed varieties:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSeedVarieties();
    const allCropTypes = new Set(selectedFields.map(f => f.crop_type));
    setExpandedCropTypes(allCropTypes);
  }, [seasonId, userId]);

  const groupedFields = selectedFields.reduce((acc, field) => {
    if (!acc[field.crop_type]) {
      acc[field.crop_type] = [];
    }
    acc[field.crop_type].push(field);
    return acc;
  }, {} as Record<CropType, Field[]>);

  const getSeedVarietiesForCrop = (cropType: CropType) => {
    return seedVarieties.filter(sv => sv.crop_type === cropType);
  };

  const handleSeedVarietyChange = (fieldId: string, seedVarietyId: string) => {
    const seedVariety = seedVarieties.find(sv => sv.id === seedVarietyId);
    if (!seedVariety) return;

    const field = selectedFields.find(f => f.id === fieldId);
    if (!field) return;

    const seedingRate = seedVariety.standard_seeding_rate?.toString() || '';
    const cost = calculateSeedCost(seedVariety, seedingRate, field.acreage);

    setAssignments(prev => {
      const newMap = new Map(prev);
      newMap.set(fieldId, {
        seedVarietyId,
        seedingRate,
        seedCostPerAcre: cost
      });
      return newMap;
    });

    setErrors(prev => {
      const newSet = new Set(prev);
      newSet.delete(fieldId);
      return newSet;
    });
  };

  const handleSeedingRateChange = (fieldId: string, rate: string) => {
    const assignment = assignments.get(fieldId);
    if (!assignment) return;

    const seedVariety = seedVarieties.find(sv => sv.id === assignment.seedVarietyId);
    if (!seedVariety) return;

    const field = selectedFields.find(f => f.id === fieldId);
    if (!field) return;

    const cost = calculateSeedCost(seedVariety, rate, field.acreage);

    setAssignments(prev => {
      const newMap = new Map(prev);
      newMap.set(fieldId, {
        ...assignment,
        seedingRate: rate,
        seedCostPerAcre: cost
      });
      return newMap;
    });
  };

  const calculateSeedCost = (seedVariety: SeedVariety, seedingRate: string, acreage: number): number => {
    const rate = parseFloat(seedingRate);
    if (!rate || rate <= 0) return 0;

    // Check if units_per_bag is valid to prevent division by zero
    if (!seedVariety.units_per_bag || seedVariety.units_per_bag === 0) {
      return 0;
    }

    // Calculate bags per acre and then cost per acre
    const bagsPerAcre = rate / seedVariety.units_per_bag;
    const costPerAcre = bagsPerAcre * seedVariety.price_per_unit;

    return costPerAcre;
  };

  const handleBulkAssign = (cropType: CropType, seedVarietyId: string) => {
    const fields = groupedFields[cropType] || [];
    const seedVariety = seedVarieties.find(sv => sv.id === seedVarietyId);
    if (!seedVariety) return;

    fields.forEach(field => {
      handleSeedVarietyChange(field.id, seedVarietyId);
    });
  };

  const toggleCropType = (cropType: CropType) => {
    setExpandedCropTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cropType)) {
        newSet.delete(cropType);
      } else {
        newSet.add(cropType);
      }
      return newSet;
    });
  };

  const handleContinue = () => {
    const newErrors = new Set<string>();
    selectedFields.forEach(field => {
      if (!assignments.has(field.id)) {
        newErrors.add(field.id);
      }
    });

    if (newErrors.size > 0) {
      setErrors(newErrors);
      return;
    }

    const assignmentArray: SeedVarietyAssignment[] = selectedFields.map(field => {
      const assignment = assignments.get(field.id)!;
      const seedingRateNum = parseFloat(assignment.seedingRate);
      const seedVariety = seedVarieties.find(sv => sv.id === assignment.seedVarietyId)!;
      const isOverride = seedingRateNum !== (seedVariety.standard_seeding_rate || 0);

      return {
        fieldId: field.id,
        seedVarietyId: assignment.seedVarietyId,
        seedingRateOverride: isOverride ? seedingRateNum : undefined,
        seedCostPerAcre: assignment.seedCostPerAcre
      };
    });

    onContinue(assignmentArray);
  };

  const totalCost = selectedFields.reduce((sum, field) => {
    const assignment = assignments.get(field.id);
    if (!assignment) return sum;
    return sum + (assignment.seedCostPerAcre * field.acreage);
  }, 0);
  const totalAcres = selectedFields.reduce((sum, f) => sum + f.acreage, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Assign Seed Varieties</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select seed variety and seeding rate for each field
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedFields).map(([cropType, fields]) => {
                const isExpanded = expandedCropTypes.has(cropType as CropType);
                const varietiesForCrop = getSeedVarietiesForCrop(cropType as CropType);

                return (
                  <div key={cropType} className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => toggleCropType(cropType as CropType)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                        <Sprout className="w-5 h-5 text-green-600" />
                        <span className="font-semibold text-gray-900 capitalize">{cropType}</span>
                        <span className="text-sm text-gray-600">
                          ({fields.length} field{fields.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 space-y-4">
                        {varietiesForCrop.length > 1 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Bulk Assign to All {cropType} Fields
                            </label>
                            <select
                              onChange={(e) => handleBulkAssign(cropType as CropType, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                            >
                              <option value="">Select a seed variety...</option>
                              {varietiesForCrop.map(variety => (
                                <option key={variety.id} value={variety.id}>
                                  {variety.product_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {fields.map(field => {
                          const assignment = assignments.get(field.id);
                          const hasError = errors.has(field.id);

                          return (
                            <div
                              key={field.id}
                              className={`border rounded-lg p-4 ${
                                hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="font-medium text-gray-900">{field.name}</h4>
                                  <p className="text-sm text-gray-600">{field.acreage} acres</p>
                                </div>
                                {assignment && (
                                  <div className="text-right">
                                    <div className="text-lg font-semibold text-green-600">
                                      ${assignment.seedCostPerAcre.toFixed(2)}/acre
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      ${(assignment.seedCostPerAcre * field.acreage).toFixed(2)} total
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Seed Variety *
                                  </label>
                                  <select
                                    value={assignment?.seedVarietyId || ''}
                                    onChange={(e) => handleSeedVarietyChange(field.id, e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  >
                                    <option value="">Select...</option>
                                    {varietiesForCrop.map(variety => (
                                      <option key={variety.id} value={variety.id}>
                                        {variety.product_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Seeding Rate (seeds/acre)
                                  </label>
                                  <input
                                    type="number"
                                    value={assignment?.seedingRate || ''}
                                    onChange={(e) => handleSeedingRateChange(field.id, e.target.value)}
                                    disabled={!assignment}
                                    placeholder="Enter rate"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                  />
                                </div>
                              </div>

                              {hasError && (
                                <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>Please select a seed variety for this field</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-gray-600">Total Seed Cost</div>
              <div className="text-2xl font-bold text-gray-900">
                ${totalCost.toFixed(2)}
                <span className="text-base font-normal text-gray-600 ml-2">
                  (${(totalCost / totalAcres).toFixed(2)}/acre)
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={onBack}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Back
            </button>
            <button
              onClick={handleContinue}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Continue to Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
