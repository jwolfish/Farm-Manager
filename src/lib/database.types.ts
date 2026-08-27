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
export type ProductCategory = 'chemical' | 'fertilizer' | 'seed';
export type LedgerEntryType = 'purchase' | 'consumption' | 'manual_adjustment' | 'reversal';
export type LedgerSourceType = 'shopping_list_line' | 'work_order' | 'manual';

export interface Database {
  public: {
    Tables: {
      farms: {
        Row: {
          id: string;
          owner_user_id: string;
          farm_name: string;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          farm_name?: string;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          owner_user_id?: string;
          farm_name?: string;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
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
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          user_id: string;
          farm_id: string | null;
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
          farm_id?: string | null;
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
          farm_id?: string | null;
          year?: number;
          name?: string;
          is_active?: boolean;
          corn_price_per_bushel?: number | null;
          soybeans_price_per_bushel?: number | null;
          wheat_price_per_bushel?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seasons_farm_id_fkey";
            columns: ["farm_id"];
            isOneToOne: false;
            referencedRelation: "farms";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "fields_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
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
          master_product_id: string | null;
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
          master_product_id?: string | null;
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
          master_product_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seed_varieties_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seed_varieties_master_product_id_fkey";
            columns: ["master_product_id"];
            isOneToOne: false;
            referencedRelation: "master_products";
            referencedColumns: ["id"];
          },
        ];
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
          master_product_id: string | null;
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
          master_product_id?: string | null;
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
          master_product_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fertilizer_products_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fertilizer_products_master_product_id_fkey";
            columns: ["master_product_id"];
            isOneToOne: false;
            referencedRelation: "master_products";
            referencedColumns: ["id"];
          },
        ];
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
          epa_reg_number: string | null;
          master_product_id: string | null;
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
          epa_reg_number?: string | null;
          master_product_id?: string | null;
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
          epa_reg_number?: string | null;
          master_product_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "individual_chemicals_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "individual_chemicals_master_product_id_fkey";
            columns: ["master_product_id"];
            isOneToOne: false;
            referencedRelation: "master_products";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "chemical_programs_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      chemical_program_items: {
        Row: {
          id: string;
          program_id: string;
          chemical_id: string;
          application_rate: number;
          application_rate_unit: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          chemical_id: string;
          application_rate: number;
          application_rate_unit?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          chemical_id?: string;
          application_rate?: number;
          application_rate_unit?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chemical_program_items_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "chemical_programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chemical_program_items_chemical_id_fkey";
            columns: ["chemical_id"];
            isOneToOne: false;
            referencedRelation: "individual_chemicals";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "equipment_rates_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "fertilizer_programs_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "fertilizer_program_items_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "fertilizer_programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fertilizer_program_items_fertilizer_product_id_fkey";
            columns: ["fertilizer_product_id"];
            isOneToOne: false;
            referencedRelation: "fertilizer_products";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_fertilizer_program_applications_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_fertilizer_program_applications_fertilizer_program_id_fkey";
            columns: ["fertilizer_program_id"];
            isOneToOne: false;
            referencedRelation: "fertilizer_programs";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_chemical_program_applications_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_chemical_program_applications_chemical_program_id_fkey";
            columns: ["chemical_program_id"];
            isOneToOne: false;
            referencedRelation: "chemical_programs";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_costs_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_costs_seed_variety_id_fkey";
            columns: ["seed_variety_id"];
            isOneToOne: false;
            referencedRelation: "seed_varieties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_costs_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "cost_templates";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "cost_templates_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_cost_overrides_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_yields_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_fertilizer_applications_field_cost_id_fkey";
            columns: ["field_cost_id"];
            isOneToOne: false;
            referencedRelation: "field_costs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_fertilizer_applications_fertilizer_product_id_fkey";
            columns: ["fertilizer_product_id"];
            isOneToOne: false;
            referencedRelation: "fertilizer_products";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "field_chemical_applications_field_cost_id_fkey";
            columns: ["field_cost_id"];
            isOneToOne: false;
            referencedRelation: "field_costs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_chemical_applications_chemical_program_id_fkey";
            columns: ["chemical_program_id"];
            isOneToOne: false;
            referencedRelation: "chemical_programs";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "yield_and_price_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "fields";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "commodity_sales_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      commodity_hedges: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          contract_date: string;
          delivery_month: string;
          contract_type: string;
          broker_elevator: string;
          bushels_hedged: number;
          futures_price: number;
          basis: number;
          net_price: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          user_id: string;
          crop_type: CropType;
          contract_date: string;
          delivery_month: string;
          contract_type?: string;
          broker_elevator?: string;
          bushels_hedged: number;
          futures_price: number;
          basis?: number;
          net_price?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          user_id?: string;
          crop_type?: CropType;
          contract_date?: string;
          delivery_month?: string;
          contract_type?: string;
          broker_elevator?: string;
          bushels_hedged?: number;
          futures_price?: number;
          basis?: number;
          net_price?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commodity_hedges_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          id: string;
          user_id: string;
          invited_user_id: string | null;
          farm_id: string | null;
          email: string;
          role: UserRole;
          status: InvitationStatus;
          invited_at: string | null;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          invited_user_id?: string | null;
          farm_id?: string | null;
          email: string;
          role?: UserRole;
          status?: InvitationStatus;
          invited_at?: string | null;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          invited_user_id?: string | null;
          farm_id?: string | null;
          email?: string;
          role?: UserRole;
          status?: InvitationStatus;
          invited_at?: string | null;
          accepted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_farm_id_fkey";
            columns: ["farm_id"];
            isOneToOne: false;
            referencedRelation: "farms";
            referencedColumns: ["id"];
          },
        ];
      };
      cascade_tasks: {
        Row: {
          id: string;
          user_id: string;
          season_id: string;
          task_type: string;
          status: string;
          entity_id: string | null;
          entity_type: string | null;
          program_type: string | null;
          started_at: string | null;
          completed_at: string | null;
          result_data: Json | null;
          error_message: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          season_id: string;
          task_type: string;
          status?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          program_type?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          result_data?: Json | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          season_id?: string;
          task_type?: string;
          status?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          program_type?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          result_data?: Json | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cascade_tasks_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [];
      };
      master_products: {
        Row: {
          id: string;
          farm_id: string;
          product_category: ProductCategory;
          canonical_name: string;
          unit_type: string;
          on_hand_quantity: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          farm_id: string;
          product_category: ProductCategory;
          canonical_name: string;
          unit_type: string;
          on_hand_quantity?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          farm_id?: string;
          product_category?: ProductCategory;
          canonical_name?: string;
          unit_type?: string;
          on_hand_quantity?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "master_products_farm_id_fkey";
            columns: ["farm_id"];
            isOneToOne: false;
            referencedRelation: "farms";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_ledger_entries: {
        Row: {
          id: string;
          farm_id: string;
          master_product_id: string;
          product_category: ProductCategory;
          entry_type: LedgerEntryType;
          quantity_delta: number;
          source_type: LedgerSourceType | null;
          source_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          farm_id: string;
          master_product_id: string;
          product_category: ProductCategory;
          entry_type: LedgerEntryType;
          quantity_delta: number;
          source_type?: LedgerSourceType | null;
          source_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          farm_id?: string;
          master_product_id?: string;
          product_category?: ProductCategory;
          entry_type?: LedgerEntryType;
          quantity_delta?: number;
          source_type?: LedgerSourceType | null;
          source_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_entries_farm_id_fkey";
            columns: ["farm_id"];
            isOneToOne: false;
            referencedRelation: "farms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_ledger_entries_master_product_id_fkey";
            columns: ["master_product_id"];
            isOneToOne: false;
            referencedRelation: "master_products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      set_active_season: {
        Args: {
          p_season_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
