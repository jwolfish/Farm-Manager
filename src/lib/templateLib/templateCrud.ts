import { supabase } from '../supabase';
import { Database } from '../database.types';
import { calculateTemplateCost } from './templateCalculations';

type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];
type CostTemplateInsert = Database['public']['Tables']['cost_templates']['Insert'];
type CostTemplateUpdate = Database['public']['Tables']['cost_templates']['Update'];

export interface ProgramReference {
  program_id: string;
  cost_per_acre: number;
}

export interface TemplateWithStats extends CostTemplate {
  fields_using_count?: number;
  total_cost_per_acre?: number;
}

export async function getTemplates(seasonId: string): Promise<TemplateWithStats[]> {
  const [templatesResult, usageResult] = await Promise.all([
    supabase.from('cost_templates').select('*').eq('season_id', seasonId).order('name'),
    supabase.from('field_costs').select('template_id').not('template_id', 'is', null),
  ]);

  if (templatesResult.error) throw templatesResult.error;

  const usageCounts = new Map<string, number>();
  for (const row of usageResult.data || []) {
    if (row.template_id) {
      usageCounts.set(row.template_id, (usageCounts.get(row.template_id) || 0) + 1);
    }
  }

  return (templatesResult.data || []).map((template) => ({
    ...template,
    fields_using_count: usageCounts.get(template.id) || 0,
    total_cost_per_acre: calculateTemplateCost(template),
  }));
}

export async function getTemplate(templateId: string): Promise<TemplateWithStats | null> {
  const { data, error } = await supabase
    .from('cost_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fieldsUsing = await getFieldsUsingTemplate(templateId);
  const totalCost = calculateTemplateCost(data);

  return {
    ...data,
    fields_using_count: fieldsUsing.length,
    total_cost_per_acre: totalCost,
  };
}

export async function createTemplate(template: CostTemplateInsert): Promise<CostTemplate> {
  const { data, error } = await supabase
    .from('cost_templates')
    .insert(template)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplate(
  templateId: string,
  updates: CostTemplateUpdate
): Promise<CostTemplate> {
  const { data, error } = await supabase
    .from('cost_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('cost_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
}

export async function getFieldsUsingTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('field_costs')
    .select(`
      field_id,
      fields (
        id,
        name,
        acreage,
        crop_type
      )
    `)
    .eq('template_id', templateId);

  if (error) throw error;
  return data || [];
}
