export type { ProgramReference, TemplateWithStats } from './templateLib/templateCrud';
export {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getFieldsUsingTemplate,
} from './templateLib/templateCrud';

export { calculateTemplateCost } from './templateLib/templateCalculations';

export type { OverrideValue, ResolvedFieldCosts } from './templateLib/fieldCostOverrides';
export {
  getFieldOverrides,
  createOrUpdateOverride,
  deleteOverride,
  deleteAllOverrides,
  unlinkFieldFromTemplate,
  getResolvedFieldCosts,
  hasOverrides,
} from './templateLib/fieldCostOverrides';

export type { SeedVarietyAssignment, ApplyTemplateResult } from './templateLib/templateApplication';
export { applyTemplateToFields } from './templateLib/templateApplication';

export type { RecalculateProgramResult } from './templateLib/programCosts';
export {
  recalculateFertilizerProgramCost,
  recalculateChemicalProgramCost,
} from './templateLib/programCosts';

export type { CascadeUpdateResult } from './templateLib/cascadeUpdates';
export {
  cascadeTemplateUpdate,
  cascadeTemplateUpdateInSeason,
  cascadeProgramUpdateInSeason,
  cascadeProductUpdateInSeason,
  cascadeChemicalUpdateInSeason,
} from './templateLib/cascadeUpdates';
