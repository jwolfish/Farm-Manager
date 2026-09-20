/**
 * The import wizard's cost-template step, as presentation only.
 *
 * Split from `SeasonImportWizard` for the reason every screen in this project eventually
 * gets split: the wizard reaches `useImportWizard` -> `seasonImport` -> the Supabase
 * client, which throws at module import on a machine with no credentials, so the step
 * could not otherwise be rendered or measured. Nothing here imports from `lib/`.
 */

/** Only what the step displays — deliberately structural, so a fixture is enough. */
export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
}

/**
 * What copying this template will actually do, worked out before the import rather than
 * reported afterwards. `missing` is the one that costs money: a program neither present
 * here nor selected for import is a hole in the template's cost per acre.
 */
export interface TemplatePreview {
  readonly reused: readonly string[];
  readonly importing: readonly string[];
  readonly missing: readonly string[];
}

interface TemplateSelectionStepProps {
  templates: readonly TemplateOption[];
  previews: ReadonlyMap<string, TemplatePreview>;
  selectedIds: readonly string[];
  onToggle: (templateId: string) => void;
  onToggleAll: () => void;
}

export function TemplateSelectionStep({
  templates,
  previews,
  selectedIds,
  onToggle,
  onToggleAll,
}: TemplateSelectionStepProps) {
  const allSelected = templates.length > 0 && selectedIds.length === templates.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-gray-600">Select cost templates to copy:</p>
        {/* py-2 -x-2 keeps this a 40px+ target without shifting the text baseline. */}
        <button
          onClick={onToggleAll}
          className="text-sm text-green-600 hover:text-green-700 font-medium py-3 px-2 -mx-2 flex-shrink-0"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        A template's per-acre costs copy across as they are. Its programs are matched to this
        season <strong>by name</strong> — where a program of that name is already here, the
        template points at it and takes its cost, so nothing is duplicated.
      </div>

      <div className="space-y-2">
        {templates.map((template) => {
          const preview = previews.get(template.id);
          const selected = selectedIds.includes(template.id);
          const nothingAttached =
            preview &&
            preview.reused.length === 0 &&
            preview.importing.length === 0 &&
            preview.missing.length === 0;

          return (
            <label
              key={template.id}
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                selected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(template.id)}
                className="w-5 h-5 mt-0.5 text-green-600 rounded focus:ring-2 focus:ring-green-500 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 break-words">{template.name}</p>
                {template.description && (
                  <p className="text-sm text-gray-600 break-words">{template.description}</p>
                )}

                <div className="mt-1.5 space-y-1 text-sm">
                  {preview && preview.reused.length > 0 && (
                    <p className="text-gray-600 break-words">
                      <span className="font-medium text-green-700">Reuses what is here:</span>{' '}
                      {preview.reused.join(', ')}
                    </p>
                  )}
                  {preview && preview.importing.length > 0 && (
                    <p className="text-gray-600 break-words">
                      <span className="font-medium text-blue-700">Comes with this import:</span>{' '}
                      {preview.importing.join(', ')}
                    </p>
                  )}
                  {preview && preview.missing.length > 0 && (
                    <p className="text-red-700 break-words">
                      <span className="font-medium">Not in this season:</span>{' '}
                      {preview.missing.join(', ')} — select{' '}
                      {preview.missing.length === 1 ? 'it' : 'them'} under Programs, or this
                      template arrives without {preview.missing.length === 1 ? 'that cost' : 'those costs'}.
                    </p>
                  )}
                  {nothingAttached && (
                    <p className="text-gray-500">Per-acre costs only — no programs attached.</p>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <p className="text-sm text-gray-500">{selectedIds.length} template(s) selected</p>
    </div>
  );
}
