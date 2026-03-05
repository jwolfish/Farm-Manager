import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import {
  getTemplates,
  deleteTemplate,
  unlinkFieldFromTemplate,
  type TemplateWithStats
} from '../lib/templateUtils';
import { TemplateForm } from '../components/TemplateForm';
import { CrossFarmCopyModal } from '../components/CrossFarmCopyModal';
import { SeasonImportWizard } from '../components/SeasonImportWizard';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Users,
  Calendar,
  Copy,
} from 'lucide-react';

interface CostTemplatesProps {
  seasonId: string | null;
  readOnly?: boolean;
  onTemplateSelect?: (templateId: string) => void;
}

export function CostTemplates({ seasonId, readOnly = false, onTemplateSelect }: CostTemplatesProps) {
  const { user } = useAuth();
  const { ownedFarms } = useFarm();
  const [templates, setTemplates] = useState<TemplateWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateWithStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showCrossFarmModal, setShowCrossFarmModal] = useState(false);
  const [crossFarmSourceSeasonId, setCrossFarmSourceSeasonId] = useState<string | null>(null);

  useEffect(() => {
    if (seasonId && user) {
      loadTemplates();
    }
  }, [seasonId, user?.id]);

  const loadTemplates = async () => {
    if (!seasonId) return;

    setLoading(true);
    try {
      const data = await getTemplates(seasonId);
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      await deleteTemplate(templateId);
      await loadTemplates();
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-600">Loading templates...</div>
      </div>
    );
  }

  if (!seasonId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-600">Please select a season to view cost templates</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Cost Templates</h2>
          <p className="text-neutral-600 mt-1">
            Create reusable cost configurations to quickly assign costs to multiple fields
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!readOnly && ownedFarms.length > 1 && seasonId && (
            <button
              onClick={() => setShowCrossFarmModal(true)}
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy from another farm
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Template
            </button>
          )}
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-12 text-center">
          <FileText className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            Get Started with Cost Templates
          </h3>
          <p className="text-neutral-600 max-w-md mx-auto mb-6">
            Create reusable cost configurations to quickly assign costs to multiple fields.
            Templates can be updated at any time and changes will automatically apply to
            all linked fields.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow-sm border border-neutral-200 hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                      {template.name}
                    </h3>
                    {template.description && (
                      <p className="text-sm text-neutral-600 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center text-sm">
                    <DollarSign className="w-4 h-4 text-green-600 mr-2" />
                    <span className="text-neutral-600">Cost per acre:</span>
                    <span className="ml-auto font-semibold text-neutral-900">
                      {formatCurrency(template.total_cost_per_acre)}
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Users className="w-4 h-4 text-blue-600 mr-2" />
                    <span className="text-neutral-600">Fields using:</span>
                    <span className="ml-auto font-semibold text-neutral-900">
                      {template.fields_using_count || 0}
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Calendar className="w-4 h-4 text-neutral-400 mr-2" />
                    <span className="text-neutral-600">Last updated:</span>
                    <span className="ml-auto text-neutral-700">
                      {new Date(template.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-neutral-200">
                  <button
                    onClick={() => setSelectedTemplate(template)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-neutral-100 text-neutral-700 rounded hover:bg-neutral-200 transition-colors text-sm"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(template.id)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Delete Template?
            </h3>
            <p className="text-neutral-600 mb-6">
              Are you sure you want to delete this template? Fields using this template
              will keep their current costs but will no longer receive updates.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-neutral-100 text-neutral-700 rounded hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {(showCreateForm || selectedTemplate) && seasonId && (
        <TemplateForm
          seasonId={seasonId}
          template={selectedTemplate}
          onClose={() => {
            setShowCreateForm(false);
            setSelectedTemplate(null);
          }}
          onSuccess={loadTemplates}
        />
      )}

      {showCrossFarmModal && seasonId && user && (
        <CrossFarmCopyModal
          currentSeasonId={seasonId}
          onSelectSourceSeason={(sourceSeasonId) => {
            setCrossFarmSourceSeasonId(sourceSeasonId);
            setShowCrossFarmModal(false);
          }}
          onCancel={() => setShowCrossFarmModal(false)}
        />
      )}

      {crossFarmSourceSeasonId && seasonId && user && (
        <div className="fixed inset-0 z-50">
          <SeasonImportWizard
            sourceSeasonId={crossFarmSourceSeasonId}
            newSeasonId={seasonId}
            userId={user.id}
            onComplete={() => {
              setCrossFarmSourceSeasonId(null);
              loadTemplates();
            }}
            onCancel={() => setCrossFarmSourceSeasonId(null)}
          />
        </div>
      )}
    </div>
  );
}
