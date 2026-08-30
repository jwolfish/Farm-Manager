import { useEffect, useState } from 'react';
import { X, FileText, DollarSign, TrendingUp } from 'lucide-react';
import { getTemplates, TemplateWithStats } from '../lib/templateUtils';
import type { CropType } from '../lib/database.types';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
}

interface TemplateSelectorProps {
  seasonId: string;
  selectedFields: Field[];
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplateSelector({
  seasonId,
  selectedFields,
  onClose,
  onSelectTemplate
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTemplates();
  }, [seasonId]);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates(seasonId);
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAcres = selectedFields.reduce((sum, field) => sum + field.acreage, 0);

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);
  const estimatedImpact = selectedTemplateData
    ? selectedTemplateData.total_cost_per_acre! * totalAcres
    : 0;

  const handleApply = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Select Cost Template</h2>
            <p className="text-sm text-gray-600 mt-1">
              Applying to {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} ({totalAcres.toFixed(1)} acres)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 border-b">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">No templates found</p>
              <p className="text-sm mt-2">Create a template from the Cost Templates page</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        {template.fields_using_count! > 0 && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {template.fields_using_count} field{template.fields_using_count !== 1 ? 's' : ''} using
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-gray-900">
                            ${template.total_cost_per_acre!.toFixed(2)}/acre
                          </span>
                        </div>
                        {selectedTemplate === template.id && (
                          <div className="flex items-center gap-1 text-sm">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <span className="font-medium text-blue-900">
                              ${estimatedImpact.toFixed(2)} total
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {selectedTemplate === template.id && (
                      <div className="ml-4 flex-shrink-0">
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedTemplate === template.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Fertilizer:</span>
                        <span className="ml-2 font-medium">${((template.fertilizer_programs as any[] || []).reduce((sum: number, p: any) => sum + (p.cost_per_acre || 0), 0)).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Chemical:</span>
                        <span className="ml-2 font-medium">${((template.chemical_programs as any[] || []).reduce((sum: number, p: any) => sum + (p.cost_per_acre || 0), 0)).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tillage:</span>
                        <span className="ml-2 font-medium">${Number(template.tillage_cost_per_acre || 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Planting:</span>
                        <span className="ml-2 font-medium">${Number(template.planting_cost_per_acre || 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Harvest:</span>
                        <span className="ml-2 font-medium">${Number(template.harvest_cost_per_acre || 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Equipment:</span>
                        <span className="ml-2 font-medium">${Number(template.equipment_cost_per_acre || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedTemplate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
          >
            Continue to Seed Selection
          </button>
        </div>
      </div>
    </div>
  );
}
