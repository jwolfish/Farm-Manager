import { Database } from '../database.types';
import { ProgramReference } from './templateCrud';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];

export function calculateTemplateCost(template: CostTemplate): number {
  const fertilizerCost = Array.isArray(template.fertilizer_programs)
    ? (template.fertilizer_programs as ProgramReference[]).reduce(
        (sum, p) => sum + (p.cost_per_acre || 0),
        0
      )
    : 0;

  const chemicalCost = Array.isArray(template.chemical_programs)
    ? (template.chemical_programs as ProgramReference[]).reduce(
        (sum, p) => sum + (p.cost_per_acre || 0),
        0
      )
    : 0;

  return (
    fertilizerCost +
    chemicalCost +
    Number(template.tillage_cost_per_acre || 0) +
    Number(template.planting_cost_per_acre || 0) +
    Number(template.harvest_cost_per_acre || 0) +
    Number(template.equipment_cost_per_acre || 0) +
    Number(template.custom_services_cost_per_acre || 0) +
    Number(template.labor_cost_per_acre || 0) +
    Number(template.crop_insurance_cost_per_acre || 0) +
    Number(template.drying_storage_cost_per_acre || 0) +
    Number(template.hauling_cost_per_acre || 0) +
    Number(template.other_expenses_per_acre || 0)
  );
}

export function calculateFieldTotalCost(fieldCost: Record<string, unknown>): number {
  return (
    Number(fieldCost.seed_cost_per_acre || 0) +
    Number(fieldCost.fertilizer_cost_per_acre || 0) +
    Number(fieldCost.chemical_cost_per_acre || 0) +
    Number(fieldCost.tillage_cost_per_acre || 0) +
    Number(fieldCost.planting_cost_per_acre || 0) +
    Number(fieldCost.harvest_cost_per_acre || 0) +
    Number(fieldCost.equipment_cost_per_acre || 0) +
    Number(fieldCost.custom_services_cost_per_acre || 0) +
    Number(fieldCost.labor_cost_per_acre || 0) +
    Number(fieldCost.crop_insurance_cost_per_acre || 0) +
    Number(fieldCost.drying_storage_cost_per_acre || 0) +
    Number(fieldCost.hauling_cost_per_acre || 0) +
    Number(fieldCost.other_expenses_per_acre || 0)
  );
}
