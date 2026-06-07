import { X, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { useImportWizard } from '../hooks/useImportWizard';

interface SeasonImportWizardProps {
  sourceSeasonId: string;
  newSeasonId: string;
  userId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function SeasonImportWizard({ sourceSeasonId, newSeasonId, userId, onComplete, onCancel }: SeasonImportWizardProps) {
  const {
    step, loading, error, setError, skippedItems,
    sourceData, selectedCategories, selectedItems, priceUpdates, cropTypeUpdates,
    setPriceUpdates, setCropTypeUpdates,
    handleNext, handleBack, handleCategoryToggle, toggleItemSelection, toggleAllInCategory,
  } = useImportWizard(sourceSeasonId, newSeasonId, userId, onComplete);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
          <p className="text-gray-600">Loading previous season data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Import from Previous Season</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 whitespace-pre-line">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'select-categories' && (
            <div className="space-y-4">
              <p className="text-gray-600 mb-6">Select which types of data you want to import:</p>
              {[
                { key: 'fields' as const, label: 'Fields', count: sourceData.fields.length },
                { key: 'seeds' as const, label: 'Seed Varieties', count: sourceData.seeds.length },
                { key: 'fertilizers' as const, label: 'Fertilizer Products', count: sourceData.fertilizers.length },
                { key: 'chemicals' as const, label: 'Individual Chemicals', count: sourceData.chemicals.length },
                { key: 'fertilizerPrograms' as const, label: 'Fertilizer Programs', count: sourceData.fertilizerPrograms.length },
                { key: 'chemicalPrograms' as const, label: 'Chemical Programs', count: sourceData.chemicalPrograms.length },
              ].map((category) => (
                <label
                  key={category.key}
                  className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedCategories[category.key]
                      ? 'border-green-500 bg-green-50'
                      : category.count === 0
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedCategories[category.key]}
                      onChange={() => handleCategoryToggle(category.key)}
                      disabled={category.count === 0}
                      className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-900">{category.label}</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {category.count} {category.count === 1 ? 'item' : 'items'}
                  </span>
                </label>
              ))}
            </div>
          )}

          {step === 'select-fields' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600">Select fields to import:</p>
                <button
                  onClick={() => toggleAllInCategory('fields', sourceData.fields.map((f) => f.id))}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  {selectedItems.fields.length === sourceData.fields.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Select</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Field Name</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Crop</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Acres</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Rent/Acre</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-700">Tax/Acre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceData.fields.map((field) => (
                      <tr key={field.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.fields.includes(field.id)}
                            onChange={() => toggleItemSelection('fields', field.id)}
                            className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                          />
                        </td>
                        <td className="p-3 text-sm text-gray-900 font-medium">{field.name}</td>
                        <td className="p-3 text-sm text-gray-600 capitalize">{field.crop_type}</td>
                        <td className="p-3 text-sm text-gray-600">{field.acreage}</td>
                        <td className="p-3 text-sm text-gray-600">${field.land_rent_per_acre.toFixed(2)}</td>
                        <td className="p-3 text-sm text-gray-600">${field.property_tax_per_acre.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-500 mt-4">{selectedItems.fields.length} field(s) selected</p>
            </div>
          )}

          {step === 'select-products' && (
            <div className="space-y-6">
              {selectedCategories.seeds && sourceData.seeds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Seed Varieties</h3>
                    <button onClick={() => toggleAllInCategory('seeds', sourceData.seeds.map((s) => s.id))} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      {selectedItems.seeds.length === sourceData.seeds.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sourceData.seeds.map((seed) => (
                      <label key={seed.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedItems.seeds.includes(seed.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedItems.seeds.includes(seed.id)} onChange={() => toggleItemSelection('seeds', seed.id)} className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
                          <div>
                            <p className="font-medium text-gray-900">{seed.product_name}</p>
                            <p className="text-sm text-gray-600 capitalize">{seed.crop_type}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">${seed.price_per_unit.toFixed(2)}/{seed.unit_type}</p>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{selectedItems.seeds.length} seed(s) selected</p>
                </div>
              )}

              {selectedCategories.fertilizers && sourceData.fertilizers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Fertilizer Products</h3>
                    <button onClick={() => toggleAllInCategory('fertilizers', sourceData.fertilizers.map((f) => f.id))} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      {selectedItems.fertilizers.length === sourceData.fertilizers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sourceData.fertilizers.map((fert) => (
                      <label key={fert.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedItems.fertilizers.includes(fert.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedItems.fertilizers.includes(fert.id)} onChange={() => toggleItemSelection('fertilizers', fert.id)} className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
                          <p className="font-medium text-gray-900">{fert.product_name}</p>
                        </div>
                        <p className="text-sm text-gray-600">${fert.price_per_unit.toFixed(2)}/{fert.unit_type}</p>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{selectedItems.fertilizers.length} fertilizer(s) selected</p>
                </div>
              )}

              {selectedCategories.chemicals && sourceData.chemicals.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Individual Chemicals</h3>
                    <button onClick={() => toggleAllInCategory('chemicals', sourceData.chemicals.map((c) => c.id))} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      {selectedItems.chemicals.length === sourceData.chemicals.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sourceData.chemicals.map((chem) => (
                      <label key={chem.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedItems.chemicals.includes(chem.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedItems.chemicals.includes(chem.id)} onChange={() => toggleItemSelection('chemicals', chem.id)} className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
                          <div>
                            <p className="font-medium text-gray-900">{chem.chemical_name}</p>
                            <p className="text-sm text-gray-600">{chem.unit_type}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">${chem.price_per_unit.toFixed(2)}/{chem.unit_type}</p>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{selectedItems.chemicals.length} chemical(s) selected</p>
                </div>
              )}
            </div>
          )}

          {step === 'select-programs' && (
            <div className="space-y-6">
              {selectedCategories.fertilizerPrograms && sourceData.fertilizerPrograms.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Fertilizer Programs</h3>
                    <button onClick={() => toggleAllInCategory('fertilizerPrograms', sourceData.fertilizerPrograms.map((p) => p.id))} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      {selectedItems.fertilizerPrograms.length === sourceData.fertilizerPrograms.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sourceData.fertilizerPrograms.map((prog) => (
                      <label key={prog.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedItems.fertilizerPrograms.includes(prog.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedItems.fertilizerPrograms.includes(prog.id)} onChange={() => toggleItemSelection('fertilizerPrograms', prog.id)} className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
                          <div>
                            <p className="font-medium text-gray-900">{prog.program_name}</p>
                            <p className="text-sm text-gray-600">{prog.fertilizer_program_items.length} product(s)</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">App Cost: ${prog.application_cost.toFixed(2)}/acre</p>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{selectedItems.fertilizerPrograms.length} program(s) selected</p>
                </div>
              )}

              {selectedCategories.chemicalPrograms && sourceData.chemicalPrograms.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Chemical Programs</h3>
                    <button onClick={() => toggleAllInCategory('chemicalPrograms', sourceData.chemicalPrograms.map((p) => p.id))} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      {selectedItems.chemicalPrograms.length === sourceData.chemicalPrograms.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sourceData.chemicalPrograms.map((prog) => (
                      <label key={prog.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedItems.chemicalPrograms.includes(prog.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedItems.chemicalPrograms.includes(prog.id)} onChange={() => toggleItemSelection('chemicalPrograms', prog.id)} className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
                          <div>
                            <p className="font-medium text-gray-900">{prog.program_name}</p>
                            <p className="text-sm text-gray-600 capitalize">{prog.crop_type} - {prog.chemical_program_items.length} chemical(s)</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">App Cost: ${prog.application_cost.toFixed(2)}/acre</p>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{selectedItems.chemicalPrograms.length} program(s) selected</p>
                </div>
              )}
            </div>
          )}

          {step === 'update-prices' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">Review and update prices for the new season. The values shown are from the previous season.</p>
              </div>

              {selectedItems.fields.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Fields</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left p-3 text-sm font-medium text-gray-700">Field Name</th>
                          <th className="text-left p-3 text-sm font-medium text-gray-700">Crop Type</th>
                          <th className="text-left p-3 text-sm font-medium text-gray-700">Rent/Acre</th>
                          <th className="text-left p-3 text-sm font-medium text-gray-700">Tax/Acre</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceData.fields.filter((f) => selectedItems.fields.includes(f.id)).map((field) => (
                          <tr key={field.id} className="border-b border-gray-100">
                            <td className="p-3 text-sm font-medium text-gray-900">{field.name}</td>
                            <td className="p-3">
                              <select
                                value={cropTypeUpdates.fields[field.id] ?? field.crop_type}
                                onChange={(e) => setCropTypeUpdates((prev) => ({ ...prev, fields: { ...prev.fields, [field.id]: e.target.value } }))}
                                className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent capitalize"
                              >
                                <option value="corn">Corn</option>
                                <option value="soybeans">Soybeans</option>
                                <option value="wheat">Wheat</option>
                              </select>
                            </td>
                            <td className="p-3">
                              <input
                                type="number" step="0.01"
                                value={priceUpdates.fields[field.id]?.land_rent_per_acre ?? field.land_rent_per_acre}
                                onChange={(e) => setPriceUpdates((prev) => ({ ...prev, fields: { ...prev.fields, [field.id]: { ...prev.fields[field.id], land_rent_per_acre: parseFloat(e.target.value) || 0 } } }))}
                                className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number" step="0.01"
                                value={priceUpdates.fields[field.id]?.property_tax_per_acre ?? field.property_tax_per_acre}
                                onChange={(e) => setPriceUpdates((prev) => ({ ...prev, fields: { ...prev.fields, [field.id]: { ...prev.fields[field.id], property_tax_per_acre: parseFloat(e.target.value) || 0 } } }))}
                                className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedItems.seeds.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Seed Varieties</h3>
                  <div className="space-y-2">
                    {sourceData.seeds.filter((s) => selectedItems.seeds.includes(s.id)).map((seed) => (
                      <div key={seed.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{seed.product_name}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-gray-600">Crop Type:</span>
                            <select
                              value={cropTypeUpdates.seeds[seed.id] ?? seed.crop_type}
                              onChange={(e) => setCropTypeUpdates((prev) => ({ ...prev, seeds: { ...prev.seeds, [seed.id]: e.target.value } }))}
                              className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent capitalize text-sm"
                            >
                              <option value="corn">Corn</option>
                              <option value="soybeans">Soybeans</option>
                              <option value="wheat">Wheat</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">Price per {seed.unit_type}:</span>
                          <input
                            type="number" step="0.01"
                            value={priceUpdates.seeds[seed.id] ?? seed.price_per_unit}
                            onChange={(e) => setPriceUpdates((prev) => ({ ...prev, seeds: { ...prev.seeds, [seed.id]: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedItems.fertilizers.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Fertilizer Products</h3>
                  <div className="space-y-2">
                    {sourceData.fertilizers.filter((f) => selectedItems.fertilizers.includes(f.id)).map((fert) => (
                      <div key={fert.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <p className="font-medium text-gray-900">{fert.product_name}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">Price per {fert.unit_type}:</span>
                          <input
                            type="number" step="0.01"
                            value={priceUpdates.fertilizers[fert.id] ?? fert.price_per_unit}
                            onChange={(e) => setPriceUpdates((prev) => ({ ...prev, fertilizers: { ...prev.fertilizers, [fert.id]: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedItems.chemicals.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Individual Chemicals</h3>
                  <div className="space-y-2">
                    {sourceData.chemicals.filter((c) => selectedItems.chemicals.includes(c.id)).map((chem) => (
                      <div key={chem.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{chem.chemical_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">Price per {chem.unit_type}:</span>
                          <input
                            type="number" step="0.01"
                            value={priceUpdates.chemicals[chem.id] ?? chem.price_per_unit}
                            onChange={(e) => setPriceUpdates((prev) => ({ ...prev, chemicals: { ...prev.chemicals, [chem.id]: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedItems.fertilizerPrograms.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Fertilizer Programs</h3>
                  <div className="space-y-2">
                    {sourceData.fertilizerPrograms.filter((p) => selectedItems.fertilizerPrograms.includes(p.id)).map((prog) => (
                      <div key={prog.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <p className="font-medium text-gray-900">{prog.program_name}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">Application Cost/acre:</span>
                          <input
                            type="number" step="0.01"
                            value={priceUpdates.fertilizerPrograms[prog.id] ?? prog.application_cost}
                            onChange={(e) => setPriceUpdates((prev) => ({ ...prev, fertilizerPrograms: { ...prev.fertilizerPrograms, [prog.id]: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedItems.chemicalPrograms.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Chemical Programs</h3>
                  <div className="space-y-2">
                    {sourceData.chemicalPrograms.filter((p) => selectedItems.chemicalPrograms.includes(p.id)).map((prog) => (
                      <div key={prog.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{prog.program_name}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-gray-600">Crop Type:</span>
                            <select
                              value={cropTypeUpdates.chemicalPrograms[prog.id] ?? prog.crop_type}
                              onChange={(e) => setCropTypeUpdates((prev) => ({ ...prev, chemicalPrograms: { ...prev.chemicalPrograms, [prog.id]: e.target.value } }))}
                              className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent capitalize text-sm"
                            >
                              <option value="corn">Corn</option>
                              <option value="soybeans">Soybeans</option>
                              <option value="wheat">Wheat</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">Application Cost/acre:</span>
                          <input
                            type="number" step="0.01"
                            value={priceUpdates.chemicalPrograms[prog.id] ?? prog.application_cost}
                            onChange={(e) => setPriceUpdates((prev) => ({ ...prev, chemicalPrograms: { ...prev.chemicalPrograms, [prog.id]: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
              <p className="text-lg text-gray-700 font-medium">Importing data...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          )}

          {step === 'import-warnings' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Import completed with warnings</p>
                  <p className="text-sm text-amber-800 mt-1">
                    The following items could not be imported because their product mappings were not found. This can happen if the associated products were not selected for import.
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {skippedItems.map((item, i) => (
                  <li key={i} className="px-4 py-3 text-sm text-gray-700 bg-white">{item}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-500">All other data was imported successfully. You can add the missing items manually.</p>
            </div>
          )}
        </div>

        {step !== 'importing' && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            {step === 'import-warnings' ? (
              <div className="flex w-full justify-end">
                <button onClick={onComplete} className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors">
                  <Check className="w-4 h-4" />
                  Done
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleBack}
                  disabled={step === 'select-categories'}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${step === 'select-categories' ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-200'}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <div className="flex gap-3">
                  <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
                  <button
                    onClick={handleNext}
                    disabled={step === 'select-categories' && !Object.values(selectedCategories).some((v) => v)}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                      step === 'select-categories' && !Object.values(selectedCategories).some((v) => v)
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {step === 'update-prices' ? (
                      <><Check className="w-4 h-4" />Complete Import</>
                    ) : (
                      <>Next<ChevronRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
