import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { fetchOwnedFarms, updateFarmName, deleteFarm, Farm } from '../lib/farms';
import { Save, Tractor, CheckCircle, Trash2, AlertTriangle, Pencil, X } from 'lucide-react';

interface FarmSettingsProps {
  onFarmsUpdated: () => void;
}

export function FarmSettings({ onFarmsUpdated }: FarmSettingsProps) {
  const { user } = useAuth();
  const { activeFarm } = useFarm();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFarmId, setSavedFarmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadFarms();
  }, [user]);

  const loadFarms = async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchOwnedFarms(user.id);
    setFarms(data);
    setLoading(false);
  };

  const handleStartEdit = (farm: Farm) => {
    setEditingFarmId(farm.id);
    setEditName(farm.farmName);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingFarmId(null);
    setEditName('');
    setError(null);
  };

  const handleSaveName = async (farmId: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    const { error: err } = await updateFarmName(farmId, editName.trim());
    if (err) {
      setError(err);
    } else {
      setSavedFarmId(farmId);
      setTimeout(() => setSavedFarmId(null), 2000);
      setEditingFarmId(null);
      await loadFarms();
      onFarmsUpdated();
    }
    setSaving(false);
  };

  const handleDelete = async (farmId: string) => {
    setDeleting(true);
    setError(null);
    const { error: err } = await deleteFarm(farmId);
    if (err) {
      setError(err);
      setDeleting(false);
      setDeleteConfirmId(null);
      return;
    }
    setDeleteConfirmId(null);
    setDeleting(false);
    await loadFarms();
    onFarmsUpdated();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="text-gray-500">Loading farm settings...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Farm Settings</h1>
        <p className="text-gray-500 mt-1">Manage your farms and their names</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {farms.map((farm) => {
          const isActive = activeFarm?.farmId === farm.id;
          const isEditing = editingFarmId === farm.id;
          const justSaved = savedFarmId === farm.id;
          const isDeleteConfirm = deleteConfirmId === farm.id;

          return (
            <div
              key={farm.id}
              className={`bg-white rounded-xl border overflow-hidden ${isActive ? 'border-green-300 ring-1 ring-green-300' : 'border-gray-200'}`}
            >
              <div className="px-6 py-4 flex items-center gap-3 border-b border-gray-100">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <Tractor className={`w-5 h-5 ${isActive ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName(farm.id);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <button
                        onClick={() => handleSaveName(farm.id)}
                        disabled={saving || !editName.trim()}
                        className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        title="Save"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{farm.farmName}</h3>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          Active
                        </span>
                      )}
                      {justSaved && (
                        <div className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Saved
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    Created {new Date(farm.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => handleStartEdit(farm)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Rename farm"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>

              {farms.length > 1 && (
                <div className="px-6 py-3">
                  {isDeleteConfirm ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-red-700 flex-1">
                        Delete <strong>{farm.farmName}</strong>? All seasons and data will be lost.
                      </p>
                      <button
                        onClick={() => handleDelete(farm.id)}
                        disabled={deleting}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(farm.id)}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete this farm
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {farms.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
          <Tractor className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No farms found. Create a farm from the sidebar.</p>
        </div>
      )}
    </div>
  );
}
