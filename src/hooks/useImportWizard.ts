import { useCallback, useEffect, useState } from 'react';
import {
  loadSeasonData,
  importSeasonData,
  validateImport,
  type Field,
  type SeedVariety,
  type FertilizerProduct,
  type IndividualChemical,
  type FertilizerProgram,
  type ChemicalProgram,
} from '../lib/seasonImport';

export type WizardStep = 'select-categories' | 'select-fields' | 'select-products' | 'select-programs' | 'update-prices' | 'importing' | 'import-warnings';

export type SourceData = {
  fields: Field[];
  seeds: SeedVariety[];
  fertilizers: FertilizerProduct[];
  chemicals: IndividualChemical[];
  fertilizerPrograms: FertilizerProgram[];
  chemicalPrograms: ChemicalProgram[];
};

export type SelectedCategories = {
  fields: boolean;
  seeds: boolean;
  fertilizers: boolean;
  chemicals: boolean;
  fertilizerPrograms: boolean;
  chemicalPrograms: boolean;
};

export type SelectedItems = {
  fields: string[];
  seeds: string[];
  fertilizers: string[];
  chemicals: string[];
  fertilizerPrograms: string[];
  chemicalPrograms: string[];
};

export type PriceUpdates = {
  fields: Record<string, { land_rent_per_acre: number; property_tax_per_acre: number }>;
  seeds: Record<string, number>;
  fertilizers: Record<string, number>;
  chemicals: Record<string, number>;
  fertilizerPrograms: Record<string, number>;
  chemicalPrograms: Record<string, number>;
};

export type CropTypeUpdates = {
  fields: Record<string, string>;
  seeds: Record<string, string>;
  chemicalPrograms: Record<string, string>;
};

const emptySourceData: SourceData = { fields: [], seeds: [], fertilizers: [], chemicals: [], fertilizerPrograms: [], chemicalPrograms: [] };
const emptySelectedCategories: SelectedCategories = { fields: false, seeds: false, fertilizers: false, chemicals: false, fertilizerPrograms: false, chemicalPrograms: false };
const emptySelectedItems: SelectedItems = { fields: [], seeds: [], fertilizers: [], chemicals: [], fertilizerPrograms: [], chemicalPrograms: [] };
const emptyPriceUpdates: PriceUpdates = { fields: {}, seeds: {}, fertilizers: {}, chemicals: {}, fertilizerPrograms: {}, chemicalPrograms: {} };
const emptyCropTypeUpdates: CropTypeUpdates = { fields: {}, seeds: {}, chemicalPrograms: {} };

export function useImportWizard(sourceSeasonId: string, newSeasonId: string, userId: string, onComplete: () => void) {
  const [step, setStep] = useState<WizardStep>('select-categories');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skippedItems, setSkippedItems] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<SourceData>(emptySourceData);
  const [selectedCategories, setSelectedCategories] = useState<SelectedCategories>(emptySelectedCategories);
  const [selectedItems, setSelectedItems] = useState<SelectedItems>(emptySelectedItems);
  const [priceUpdates, setPriceUpdates] = useState<PriceUpdates>(emptyPriceUpdates);
  const [cropTypeUpdates, setCropTypeUpdates] = useState<CropTypeUpdates>(emptyCropTypeUpdates);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadSeasonData(sourceSeasonId, userId);
      setSourceData(data);

      const initialPrices: PriceUpdates = { fields: {}, seeds: {}, fertilizers: {}, chemicals: {}, fertilizerPrograms: {}, chemicalPrograms: {} };
      data.fields.forEach((f) => { initialPrices.fields[f.id] = { land_rent_per_acre: f.land_rent_per_acre, property_tax_per_acre: f.property_tax_per_acre }; });
      data.seeds.forEach((s) => { initialPrices.seeds[s.id] = s.price_per_unit; });
      data.fertilizers.forEach((f) => { initialPrices.fertilizers[f.id] = f.price_per_unit; });
      data.chemicals.forEach((c) => { initialPrices.chemicals[c.id] = c.price_per_unit; });
      data.fertilizerPrograms.forEach((p) => { initialPrices.fertilizerPrograms[p.id] = p.application_cost; });
      data.chemicalPrograms.forEach((p) => { initialPrices.chemicalPrograms[p.id] = p.application_cost; });
      setPriceUpdates(initialPrices);

      const initialCropTypes: CropTypeUpdates = { fields: {}, seeds: {}, chemicalPrograms: {} };
      data.fields.forEach((f) => { initialCropTypes.fields[f.id] = f.crop_type; });
      data.seeds.forEach((s) => { initialCropTypes.seeds[s.id] = s.crop_type; });
      data.chemicalPrograms.forEach((p) => { initialCropTypes.chemicalPrograms[p.id] = p.crop_type; });
      setCropTypeUpdates(initialCropTypes);
    } catch (err) {
      console.error('Error loading source data:', err);
      setError('Failed to load previous season data');
    } finally {
      setLoading(false);
    }
  }, [sourceSeasonId, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasProducts = (selectedCategories.seeds || selectedCategories.fertilizers || selectedCategories.chemicals) &&
    (sourceData.seeds.length > 0 || sourceData.fertilizers.length > 0 || sourceData.chemicals.length > 0);

  const hasPrograms = (selectedCategories.fertilizerPrograms || selectedCategories.chemicalPrograms) &&
    (sourceData.fertilizerPrograms.length > 0 || sourceData.chemicalPrograms.length > 0);

  const hasFields = selectedCategories.fields && sourceData.fields.length > 0;

  const handleNext = () => {
    if (step === 'select-categories') {
      if (hasFields) { setStep('select-fields'); }
      else if (hasProducts) { setStep('select-products'); }
      else if (hasPrograms) { setStep('select-programs'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-fields') {
      if (hasProducts) { setStep('select-products'); }
      else if (hasPrograms) { setStep('select-programs'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-products') {
      if (hasPrograms) { setStep('select-programs'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-programs') {
      const validation = validateImport(selectedItems, sourceData);
      if (!validation.valid) { setError(validation.errors.join('\n')); return; }
      setStep('update-prices');
    } else if (step === 'update-prices') {
      handleImport();
    }
  };

  const handleBack = () => {
    if (step === 'update-prices') {
      if (hasPrograms) { setStep('select-programs'); }
      else if (hasProducts) { setStep('select-products'); }
      else if (hasFields) { setStep('select-fields'); }
      else { setStep('select-categories'); }
    } else if (step === 'select-programs') {
      if (hasProducts) { setStep('select-products'); }
      else if (hasFields) { setStep('select-fields'); }
      else { setStep('select-categories'); }
    } else if (step === 'select-products') {
      if (hasFields) { setStep('select-fields'); }
      else { setStep('select-categories'); }
    } else if (step === 'select-fields') {
      setStep('select-categories');
    }
  };

  const handleImport = async () => {
    setStep('importing');
    setError(null);
    try {
      const result = await importSeasonData(newSeasonId, userId, selectedItems, sourceData, priceUpdates, cropTypeUpdates);
      if (result.skippedItems && result.skippedItems.length > 0) {
        setSkippedItems(result.skippedItems);
        setStep('import-warnings');
      } else {
        onComplete();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError('Import failed. Please try again.');
      setStep('update-prices');
    }
  };

  const handleCategoryToggle = (category: keyof SelectedCategories) => {
    const newCategories = { ...selectedCategories, [category]: !selectedCategories[category] };
    setSelectedCategories(newCategories);
    if (!newCategories[category]) {
      setSelectedItems((prev) => ({ ...prev, [category]: [] }));
    }
  };

  const toggleItemSelection = (category: keyof SelectedItems, itemId: string) => {
    setSelectedItems((prev) => {
      const current = prev[category];
      const isSelected = current.includes(itemId);
      return { ...prev, [category]: isSelected ? current.filter((id) => id !== itemId) : [...current, itemId] };
    });
  };

  const toggleAllInCategory = (category: keyof SelectedItems, itemIds: string[]) => {
    setSelectedItems((prev) => {
      const allSelected = itemIds.every((id) => prev[category].includes(id));
      return { ...prev, [category]: allSelected ? [] : itemIds };
    });
  };

  return {
    step, loading, error, setError, skippedItems,
    sourceData, selectedCategories, selectedItems, priceUpdates, cropTypeUpdates,
    setPriceUpdates, setCropTypeUpdates,
    handleNext, handleBack, handleCategoryToggle, toggleItemSelection, toggleAllInCategory,
  };
}
