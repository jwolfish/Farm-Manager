export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CropType = 'corn' | 'soybeans' | 'wheat';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          farm_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          farm_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          farm_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      seasons: {
        Row: {
          id: string;
          user_id: string;
          year: number;
          name: string;
          is_active: boolean;
          corn_price_per_bushel: number | null;
          soybeans_price_per_bushel: number | null;
          wheat_price_per_bushel: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          year: number;
          name: string;
          is_active?: boolean;
          corn_price_per_bushel?: number | null;
          soybeans_price_per_bushel?: number | null;
          wheat_price_per_bushel?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          year?: number;
          name?: string;
          is_active?: boolean;
          corn_price_per_bushel?: number | null;
          soybeans_price_per_bushel?: number | null;
          wheat_price_per_bushel?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      fields: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          name: string;
          crop_type: CropType;
          acreage: number;
          land_rent_per_acre: number;
          property_tax_per_acre: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          name: string;
          crop_type: CropType;
          acreage: number;
          land_rent_per_acre?: number;
          property_tax_per_acre?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          name?: string;
          crop_type?: CropType;
          acreage?: number;
          land_rent_per_acre?: number;
          property_tax_per_acre?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      seed_varieties: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          product_name: string;
          crop_type: CropType;
          price_per_unit: number;
          unit_type: string;
          standard_seeding_rate: number | null;
          units_per_bag: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          product_name: string;
          crop_type: CropType;
          price_per_unit: number;
          unit_type: string;
          standard_seeding_rate?: number | null;
          units_per_bag?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          product_name?: string;
          crop_type?: CropType;
          price_per_unit?: number;
          unit_type?: string;
          standard_seeding_rate?: number | null;
          units_per_bag?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      fertilizer_products: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          product_name: string;
          price_per_unit: number;
          unit_type: string;
          application_rate: number | null;
          application_rate_unit: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          product_name: string;
          price_per_unit: number;
          unit_type: string;
          application_rate?: number | null;
          application_rate_unit?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          product_name?: string;
          price_per_unit?: number;
          unit_type?: string;
          application_rate?: number | null;
          application_rate_unit?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      individual_chemicals: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          chemical_name: string;
          price_per_unit: number;
          unit_type: string;
          default_application_rate: number | null;
          default_application_rate_unit: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          chemical_name: string;
          price_per_unit: number;
          unit_type: string;
          default_application_rate?: number | null;
          default_application_rate_unit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          chemical_name?: string;
          price_per_unit?: number;
          unit_type?: string;
          default_application_rate?: number | null;
          default_application_rate_unit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chemical_programs: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          program_name: string;
          crop_type: CropType;
          application_cost: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          program_name: string;
          crop_type: CropType;
          application_cost?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          program_name?: string;
          crop_type?: CropType;
          application_cost?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chemical_program_items: {
        Row: {
          id: string;
          program_id: string;
          chemical_id: string;
          application_rate: number;
          application_rate_unit: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          chemical_id: string;
          application_rate: number;
          application_rate_unit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          chemical_id?: string;
          application_rate?: number;
          application_rate_unit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      equipment_rates: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          rate_per_acre: number;
          source: string;
          is_overridden: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          rate_per_acre: number;
          source?: string;
          is_overridden?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          crop_type?: CropType;
          rate_per_acre?: number;
          source?: string;
          is_overridden?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      fertilizer_programs: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          program_name: string;
          application_cost: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          program_name: string;
          application_cost?: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          program_name?: string;
          application_cost?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      fertilizer_program_items: {
        Row: {
          id: string;
          program_id: string;
          fertilizer_product_id: string;
          application_rate: number;
          application_rate_unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          fertilizer_product_id: string;
          application_rate: number;
          application_rate_unit: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          fertilizer_product_id?: string;
          application_rate?: number;
          application_rate_unit?: string;
          created_at?: string;
        };
      };
      field_fertilizer_program_applications: {
        Row: {
          id: string;
          field_id: string;
          fertilizer_program_id: string;
          cost_per_acre: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          fertilizer_program_id: string;
          cost_per_acre?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          fertilizer_program_id?: string;
          cost_per_acre?: number;
          created_at?: string;
        };
      };
      field_chemical_program_applications: {
        Row: {
          id: string;
          field_id: string;
          chemical_program_id: string;
          cost_per_acre: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          chemical_program_id: string;
          cost_per_acre?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          chemical_program_id?: string;
          cost_per_acre?: number;
          created_at?: string;
        };
      };
      field_costs: {
        Row: {
          id: string;
          field_id: string;
          user_id: string;
          template_id: string | null;
          seed_variety_id: string | null;
          seeding_rate_override: number | null;
          seed_cost_per_acre: number;
          fertilizer_cost_per_acre: number;
          chemical_cost_per_acre: number;
          tillage_cost_per_acre: number;
          planting_cost_per_acre: number;
          harvest_cost_per_acre: number;
          equipment_cost_per_acre: number;
          custom_services_cost_per_acre: number;
          labor_cost_per_acre: number;
          crop_insurance_cost_per_acre: number;
          drying_storage_cost_per_acre: number;
          drying_storage_per_bushel: number | null;
          hauling_cost_per_acre: number;
          hauling_per_bushel: number | null;
          other_expenses_per_acre: number;
          total_cost_per_acre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          user_id: string;
          template_id?: string | null;
          seed_variety_id?: string | null;
          seeding_rate_override?: number | null;
          seed_cost_per_acre?: number;
          fertilizer_cost_per_acre?: number;
          chemical_cost_per_acre?: number;
          tillage_cost_per_acre?: number;
          planting_cost_per_acre?: number;
          harvest_cost_per_acre?: number;
          equipment_cost_per_acre?: number;
          custom_services_cost_per_acre?: number;
          labor_cost_per_acre?: number;
          crop_insurance_cost_per_acre?: number;
          drying_storage_cost_per_acre?: number;
          drying_storage_per_bushel?: number | null;
          hauling_cost_per_acre?: number;
          hauling_per_bushel?: number | null;
          other_expenses_per_acre?: number;
          total_cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          user_id?: string;
          template_id?: string | null;
          seed_variety_id?: string | null;
          seeding_rate_override?: number | null;
          seed_cost_per_acre?: number;
          fertilizer_cost_per_acre?: number;
          chemical_cost_per_acre?: number;
          tillage_cost_per_acre?: number;
          planting_cost_per_acre?: number;
          harvest_cost_per_acre?: number;
          equipment_cost_per_acre?: number;
          custom_services_cost_per_acre?: number;
          labor_cost_per_acre?: number;
          crop_insurance_cost_per_acre?: number;
          drying_storage_cost_per_acre?: number;
          drying_storage_per_bushel?: number | null;
          hauling_cost_per_acre?: number;
          hauling_per_bushel?: number | null;
          other_expenses_per_acre?: number;
          total_cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      cost_templates: {
        Row: {
          id: string;
          user_id: string;
          season_id: string;
          name: string;
          description: string | null;
          fertilizer_programs: Json;
          chemical_programs: Json;
          tillage_cost_per_acre: number;
          planting_cost_per_acre: number;
          harvest_cost_per_acre: number;
          equipment_cost_per_acre: number;
          custom_services_cost_per_acre: number;
          labor_cost_per_acre: number;
          crop_insurance_cost_per_acre: number;
          other_expenses_per_acre: number;
          drying_storage_cost_per_acre: number;
          hauling_cost_per_acre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          season_id: string;
          name: string;
          description?: string | null;
          fertilizer_programs?: Json;
          chemical_programs?: Json;
          tillage_cost_per_acre?: number;
          planting_cost_per_acre?: number;
          harvest_cost_per_acre?: number;
          equipment_cost_per_acre?: number;
          custom_services_cost_per_acre?: number;
          labor_cost_per_acre?: number;
          crop_insurance_cost_per_acre?: number;
          other_expenses_per_acre?: number;
          drying_storage_cost_per_acre?: number;
          hauling_cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          season_id?: string;
          name?: string;
          description?: string | null;
          fertilizer_programs?: Json;
          chemical_programs?: Json;
          tillage_cost_per_acre?: number;
          planting_cost_per_acre?: number;
          harvest_cost_per_acre?: number;
          equipment_cost_per_acre?: number;
          custom_services_cost_per_acre?: number;
          labor_cost_per_acre?: number;
          crop_insurance_cost_per_acre?: number;
          other_expenses_per_acre?: number;
          drying_storage_cost_per_acre?: number;
          hauling_cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      field_cost_overrides: {
        Row: {
          id: string;
          field_id: string;
          cost_item_name: string;
          override_value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          cost_item_name: string;
          override_value: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          cost_item_name?: string;
          override_value?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      field_yields: {
        Row: {
          id: string;
          field_id: string;
          user_id: string;
          yield_bushels_per_acre: number;
          total_yield_bushels: number;
          harvest_date: string | null;
          moisture_percentage: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          user_id: string;
          yield_bushels_per_acre: number;
          total_yield_bushels: number;
          harvest_date?: string | null;
          moisture_percentage?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          user_id?: string;
          yield_bushels_per_acre?: number;
          total_yield_bushels?: number;
          harvest_date?: string | null;
          moisture_percentage?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      field_fertilizer_applications: {
        Row: {
          id: string;
          field_cost_id: string;
          fertilizer_product_id: string;
          application_rate: number;
          cost_per_acre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_cost_id: string;
          fertilizer_product_id: string;
          application_rate: number;
          cost_per_acre: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_cost_id?: string;
          fertilizer_product_id?: string;
          application_rate?: number;
          cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      field_chemical_applications: {
        Row: {
          id: string;
          field_cost_id: string;
          chemical_program_id: string;
          cost_per_acre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_cost_id: string;
          chemical_program_id: string;
          cost_per_acre: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_cost_id?: string;
          chemical_program_id?: string;
          cost_per_acre?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      yield_and_price: {
        Row: {
          id: string;
          field_id: string;
          user_id: string;
          yield_per_acre: number | null;
          price_per_bushel: number | null;
          cost_per_bushel: number | null;
          gross_revenue_per_acre: number | null;
          profit_per_acre: number | null;
          harvest_date: string | null;
          sale_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          user_id: string;
          yield_per_acre?: number | null;
          price_per_bushel?: number | null;
          cost_per_bushel?: number | null;
          gross_revenue_per_acre?: number | null;
          profit_per_acre?: number | null;
          harvest_date?: string | null;
          sale_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field_id?: string;
          user_id?: string;
          yield_per_acre?: number | null;
          price_per_bushel?: number | null;
          cost_per_bushel?: number | null;
          gross_revenue_per_acre?: number | null;
          profit_per_acre?: number | null;
          harvest_date?: string | null;
          sale_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      commodity_sales: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          sale_date: string;
          delivery_month: string;
          destination: string;
          bushels_sold: number;
          price_per_bushel: number;
          total_revenue: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          sale_date: string;
          delivery_month: string;
          destination: string;
          bushels_sold: number;
          price_per_bushel: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          crop_type?: CropType;
          sale_date?: string;
          delivery_month?: string;
          destination?: string;
          bushels_sold?: number;
          price_per_bushel?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      team_members: {
        Row: {
          id: string;
          user_id: string;
          invited_user_id: string | null;
          season_id: string | null;
          email: string;
          role: UserRole;
          status: InvitationStatus;
          invited_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          invited_user_id?: string | null;
          season_id?: string | null;
          email: string;
          role?: UserRole;
          status?: InvitationStatus;
          invited_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          invited_user_id?: string | null;
          season_id?: string | null;
          email?: string;
          role?: UserRole;
          status?: InvitationStatus;
          invited_at?: string;
          accepted_at?: string | null;
        };
      };
      app_notifications: {
        Row: {
          id: string;
          recipient_user_id: string;
          sender_user_id: string | null;
          type: string;
          payload: Json;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_user_id: string;
          sender_user_id?: string | null;
          type?: string;
          payload?: Json;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_user_id?: string;
          sender_user_id?: string | null;
          type?: string;
          payload?: Json;
          is_read?: boolean;
          created_at?: string;
        };
      };
    };
  };
}
