import { useCallback, useEffect, useState } from 'react';
import {
  loadSeasonData,
  loadDestinationPrograms,
  importSeasonData,
  validateImport,
  type Field,
  type SeedVariety,
  type FertilizerProduct,
  type IndividualChemical,
  type FertilizerProgram,
  type ChemicalProgram,
  type CostTemplate,
} from '../lib/seasonImport';
import { resolveTemplateProgramRefs, indexProgramsByName } from '../lib/costTemplateImport';

export type WizardStep = 'select-categories' | 'select-fields' | 'select-products' | 'select-programs' | 'select-templates' | 'update-prices' | 'importing' | 'import-warnings';

export type SourceData = {
  fields: Field[];
  seeds: SeedVariety[];
  fertilizers: FertilizerProduct[];
  chemicals: IndividualChemical[];
  fertilizerPrograms: FertilizerProgram[];
  chemicalPrograms: ChemicalProgram[];
  costTemplates: CostTemplate[];
};

/** Program names the destination already holds, so a template can say what it will reuse. */
export type DestinationPrograms = {
  fertilizerPrograms: { id: string; program_name: string }[];
  chemicalPrograms: { id: string; program_name: string }[];
  templateNames: string[];
};

export type SelectedCategories = {
  fields: boolean;
  seeds: boolean;
  fertilizers: boolean;
  chemicals: boolean;
  fertilizerPrograms: boolean;
  chemicalPrograms: boolean;
  costTemplates: boolean;
};

export type SelectedItems = {
  fields: string[];
  seeds: string[];
  fertilizers: string[];
  chemicals: string[];
  fertilizerPrograms: string[];
  chemicalPrograms: string[];
  costTemplates: string[];
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

const emptySourceData: SourceData = { fields: [], seeds: [], fertilizers: [], chemicals: [], fertilizerPrograms: [], chemicalPrograms: [], costTemplates: [] };
const emptyDestination: DestinationPrograms = { fertilizerPrograms: [], chemicalPrograms: [], templateNames: [] };
const emptySelectedCategories: SelectedCategories = { fields: false, seeds: false, fertilizers: false, chemicals: false, fertilizerPrograms: false, chemicalPrograms: false, costTemplates: false };
const emptySelectedItems: SelectedItems = { fields: [], seeds: [], fertilizers: [], chemicals: [], fertilizerPrograms: [], chemicalPrograms: [], costTemplates: [] };
const emptyPriceUpdates: PriceUpdates = { fields: {}, seeds: {}, fertilizers: {}, chemicals: {}, fertilizerPrograms: {}, chemicalPrograms: {} };
const emptyCropTypeUpdates: CropTypeUpdates = { fields: {}, seeds: {}, chemicalPrograms: {} };

export function useImportWizard(sourceSeasonId: string, newSeasonId: string, userId: string, onComplete: () => void) {
  const [step, setStep] = useState<WizardStep>('select-categories');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skippedItems, setSkippedItems] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<SourceData>(emptySourceData);
  const [destination, setDestination] = useState<DestinationPrograms>(emptyDestination);
  const [selectedCategories, setSelectedCategories] = useState<SelectedCategories>(emptySelectedCategories);
  const [selectedItems, setSelectedItems] = useState<SelectedItems>(emptySelectedItems);
  const [priceUpdates, setPriceUpdates] = useState<PriceUpdates>(emptyPriceUpdates);
  const [cropTypeUpdates, setCropTypeUpdates] = useState<CropTypeUpdates>(emptyCropTypeUpdates);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, destinationPrograms] = await Promise.all([
        loadSeasonData(sourceSeasonId, userId),
        loadDestinationPrograms(newSeasonId),
      ]);
      setSourceData(data);
      setDestination(destinationPrograms);

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
  }, [sourceSeasonId, newSeasonId, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasProducts = (selectedCategories.seeds || selectedCategories.fertilizers || selectedCategories.chemicals) &&
    (sourceData.seeds.length > 0 || sourceData.fertilizers.length > 0 || sourceData.chemicals.length > 0);

  const hasPrograms = (selectedCategories.fertilizerPrograms || selectedCategories.chemicalPrograms) &&
    (sourceData.fertilizerPrograms.length > 0 || sourceData.chemicalPrograms.length > 0);

  const hasFields = selectedCategories.fields && sourceData.fields.length > 0;

  const hasTemplates = selectedCategories.costTemplates && sourceData.costTemplates.length > 0;

  const destinationProgramNames = {
    fertilizer: destination.fertilizerPrograms.map((p) => p.program_name),
    chemical: destination.chemicalPrograms.map((p) => p.program_name),
  };

  /*
   * What each selected template will actually do, shown BEFORE the import rather than
   * reported as a warning afterwards. A template that quietly lost a program would be an
   * understated cost per acre, and the screen is the only place that can say so in time.
   *
   * The preview resolves against the destination as it stands PLUS whatever programs are
   * selected in this run, which is exactly the state `importSeasonData` will read once
   * those programs have been written.
   */
  const templatePreviews = (() => {
    const pendingFert = sourceData.fertilizerPrograms
      .filter((p) => selectedItems.fertilizerPrograms.includes(p.id))
      .map((p) => ({ id: `pending:${p.id}`, program_name: p.program_name }));
    const pendingChem = sourceData.chemicalPrograms
      .filter((p) => selectedItems.chemicalPrograms.includes(p.id))
      .map((p) => ({ id: `pending:${p.id}`, program_name: p.program_name }));

    // The destination's own programs come first, so a name present on both sides reads as
    // "reused" rather than "will be imported" — which is what will actually happen.
    const fertByName = indexProgramsByName([...destination.fertilizerPrograms, ...pendingFert]).byName;
    const chemByName = indexProgramsByName([...destination.chemicalPrograms, ...pendingChem]).byName;
    const existingFert = new Set(destination.fertilizerPrograms.map((p) => p.id));
    const existingChem = new Set(destination.chemicalPrograms.map((p) => p.id));

    const sourceFertNames = new Map(sourceData.fertilizerPrograms.map((p) => [p.id, p.program_name]));
    const sourceChemNames = new Map(sourceData.chemicalPrograms.map((p) => [p.id, p.program_name]));

    return new Map(
      sourceData.costTemplates.map((template) => {
        const fert = resolveTemplateProgramRefs(template.fertilizer_programs, sourceFertNames, fertByName);
        const chem = resolveTemplateProgramRefs(template.chemical_programs, sourceChemNames, chemByName);
        const reused = [
          ...fert.resolved.filter((r) => existingFert.has(r.programId)),
          ...chem.resolved.filter((r) => existingChem.has(r.programId)),
        ].map((r) => r.name);
        const importing = [
          ...fert.resolved.filter((r) => !existingFert.has(r.programId)),
          ...chem.resolved.filter((r) => !existingChem.has(r.programId)),
        ].map((r) => r.name);
        return [
          template.id,
          { reused, importing, missing: [...fert.unresolved, ...chem.unresolved] },
        ] as const;
      })
    );
  })();

  const handleNext = () => {
    if (step === 'select-categories') {
      if (hasFields) { setStep('select-fields'); }
      else if (hasProducts) { setStep('select-products'); }
      else if (hasPrograms) { setStep('select-programs'); }
      else if (hasTemplates) { setStep('select-templates'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-fields') {
      if (hasProducts) { setStep('select-products'); }
      else if (hasPrograms) { setStep('select-programs'); }
      else if (hasTemplates) { setStep('select-templates'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-products') {
      if (hasPrograms) { setStep('select-programs'); }
      else if (hasTemplates) { setStep('select-templates'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-programs') {
      const validation = validateImport(selectedItems, sourceData, destinationProgramNames);
      if (!validation.valid) { setError(validation.errors.join('\n')); return; }
      if (hasTemplates) { setStep('select-templates'); }
      else { setStep('update-prices'); }
    } else if (step === 'select-templates') {
      const validation = validateImport(selectedItems, sourceData, destinationProgramNames);
      if (!validation.valid) { setError(validation.errors.join('\n')); return; }
      setStep('update-prices');
    } else if (step === 'update-prices') {
      handleImport();
    }
  };

  const handleBack = () => {
    if (step === 'update-prices') {
      if (hasTemplates) { setStep('select-templates'); }
      else if (hasPrograms) { setStep('select-programs'); }
      else if (hasProducts) { setStep('select-products'); }
      else if (hasFields) { setStep('select-fields'); }
      else { setStep('select-categories'); }
    } else if (step === 'select-templates') {
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
    templatePreviews,
    setPriceUpdates, setCropTypeUpdates,
    handleNext, handleBack, handleCategoryToggle, toggleItemSelection, toggleAllInCategory,
  };
}
