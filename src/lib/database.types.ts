export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          payload: Json
          recipient_user_id: string
          sender_user_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          recipient_user_id: string
          sender_user_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          recipient_user_id?: string
          sender_user_id?: string | null
          type?: string
        }
        Relationships: []
      }
      cascade_tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          program_type: string | null
          result_data: Json | null
          season_id: string
          started_at: string | null
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          program_type?: string | null
          result_data?: Json | null
          season_id: string
          started_at?: string | null
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          program_type?: string | null
          result_data?: Json | null
          season_id?: string
          started_at?: string | null
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cascade_tasks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      chemical_program_items: {
        Row: {
          application_rate: number
          application_rate_unit: string | null
          chemical_id: string
          created_at: string | null
          id: string
          notes: string | null
          program_id: string
          updated_at: string | null
        }
        Insert: {
          application_rate: number
          application_rate_unit?: string | null
          chemical_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          program_id: string
          updated_at?: string | null
        }
        Update: {
          application_rate?: number
          application_rate_unit?: string | null
          chemical_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          program_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chemical_program_items_chemical_id_fkey"
            columns: ["chemical_id"]
            isOneToOne: false
            referencedRelation: "individual_chemicals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chemical_program_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "chemical_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      chemical_programs: {
        Row: {
          application_cost: number
          created_at: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id: string
          notes: string | null
          program_name: string
          season_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          application_cost?: number
          created_at?: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id?: string
          notes?: string | null
          program_name: string
          season_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          application_cost?: number
          created_at?: string | null
          crop_type?: Database["public"]["Enums"]["crop_type"]
          id?: string
          notes?: string | null
          program_name?: string
          season_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chemical_programs_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      commodity_hedges: {
        Row: {
          basis: number
          broker_elevator: string
          bushels_hedged: number
          contract_date: string
          contract_type: string
          created_at: string | null
          crop_type: string
          delivery_month: string
          futures_price: number
          id: string
          net_price: number
          notes: string | null
          season_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          basis?: number
          broker_elevator?: string
          bushels_hedged: number
          contract_date: string
          contract_type?: string
          created_at?: string | null
          crop_type: string
          delivery_month: string
          futures_price: number
          id?: string
          net_price?: number
          notes?: string | null
          season_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          basis?: number
          broker_elevator?: string
          bushels_hedged?: number
          contract_date?: string
          contract_type?: string
          created_at?: string | null
          crop_type?: string
          delivery_month?: string
          futures_price?: number
          id?: string
          net_price?: number
          notes?: string | null
          season_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commodity_hedges_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      commodity_sales: {
        Row: {
          bushels_sold: number
          created_at: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          delivery_month: string
          destination: string
          id: string
          notes: string | null
          price_per_bushel: number
          sale_date: string
          season_id: string
          total_revenue: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bushels_sold?: number
          created_at?: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          delivery_month: string
          destination?: string
          id?: string
          notes?: string | null
          price_per_bushel?: number
          sale_date: string
          season_id: string
          total_revenue?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bushels_sold?: number
          created_at?: string | null
          crop_type?: Database["public"]["Enums"]["crop_type"]
          delivery_month?: string
          destination?: string
          id?: string
          notes?: string | null
          price_per_bushel?: number
          sale_date?: string
          season_id?: string
          total_revenue?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commodity_sales_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_templates: {
        Row: {
          chemical_programs: Json | null
          created_at: string | null
          crop_insurance_cost_per_acre: number | null
          custom_services_cost_per_acre: number | null
          description: string | null
          drying_storage_cost_per_acre: number | null
          equipment_cost_per_acre: number | null
          fertilizer_programs: Json | null
          harvest_cost_per_acre: number | null
          hauling_cost_per_acre: number | null
          id: string
          labor_cost_per_acre: number | null
          name: string
          other_expenses_per_acre: number | null
          planting_cost_per_acre: number | null
          season_id: string
          tillage_cost_per_acre: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chemical_programs?: Json | null
          created_at?: string | null
          crop_insurance_cost_per_acre?: number | null
          custom_services_cost_per_acre?: number | null
          description?: string | null
          drying_storage_cost_per_acre?: number | null
          equipment_cost_per_acre?: number | null
          fertilizer_programs?: Json | null
          harvest_cost_per_acre?: number | null
          hauling_cost_per_acre?: number | null
          id?: string
          labor_cost_per_acre?: number | null
          name: string
          other_expenses_per_acre?: number | null
          planting_cost_per_acre?: number | null
          season_id: string
          tillage_cost_per_acre?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chemical_programs?: Json | null
          created_at?: string | null
          crop_insurance_cost_per_acre?: number | null
          custom_services_cost_per_acre?: number | null
          description?: string | null
          drying_storage_cost_per_acre?: number | null
          equipment_cost_per_acre?: number | null
          fertilizer_programs?: Json | null
          harvest_cost_per_acre?: number | null
          hauling_cost_per_acre?: number | null
          id?: string
          labor_cost_per_acre?: number | null
          name?: string
          other_expenses_per_acre?: number | null
          planting_cost_per_acre?: number | null
          season_id?: string
          tillage_cost_per_acre?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_templates_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_rates: {
        Row: {
          created_at: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id: string
          is_overridden: boolean | null
          notes: string | null
          rate_per_acre: number
          season_id: string
          source: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id?: string
          is_overridden?: boolean | null
          notes?: string | null
          rate_per_acre: number
          season_id: string
          source?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          crop_type?: Database["public"]["Enums"]["crop_type"]
          id?: string
          is_overridden?: boolean | null
          notes?: string | null
          rate_per_acre?: number
          season_id?: string
          source?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_rates_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      farms: {
        Row: {
          created_at: string | null
          farm_name: string
          id: string
          is_active: boolean | null
          owner_user_id: string
        }
        Insert: {
          created_at?: string | null
          farm_name?: string
          id?: string
          is_active?: boolean | null
          owner_user_id: string
        }
        Update: {
          created_at?: string | null
          farm_name?: string
          id?: string
          is_active?: boolean | null
          owner_user_id?: string
        }
        Relationships: []
      }
      fertilizer_products: {
        Row: {
          application_rate: number | null
          application_rate_unit: string | null
          created_at: string | null
          density_lb_per_gal: number | null
          id: string
          master_product_id: string | null
          notes: string | null
          price_per_unit: number
          product_name: string
          season_id: string
          unit_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          application_rate?: number | null
          application_rate_unit?: string | null
          created_at?: string | null
          density_lb_per_gal?: number | null
          id?: string
          master_product_id?: string | null
          notes?: string | null
          price_per_unit: number
          product_name: string
          season_id: string
          unit_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          application_rate?: number | null
          application_rate_unit?: string | null
          created_at?: string | null
          density_lb_per_gal?: number | null
          id?: string
          master_product_id?: string | null
          notes?: string | null
          price_per_unit?: number
          product_name?: string
          season_id?: string
          unit_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fertilizer_products_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fertilizer_products_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      fertilizer_program_items: {
        Row: {
          application_rate: number
          application_rate_unit: string
          created_at: string | null
          fertilizer_product_id: string
          id: string
          program_id: string
        }
        Insert: {
          application_rate: number
          application_rate_unit: string
          created_at?: string | null
          fertilizer_product_id: string
          id?: string
          program_id: string
        }
        Update: {
          application_rate?: number
          application_rate_unit?: string
          created_at?: string | null
          fertilizer_product_id?: string
          id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fertilizer_program_items_fertilizer_product_id_fkey"
            columns: ["fertilizer_product_id"]
            isOneToOne: false
            referencedRelation: "fertilizer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fertilizer_program_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fertilizer_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      fertilizer_programs: {
        Row: {
          application_cost: number
          created_at: string | null
          id: string
          notes: string | null
          program_name: string
          season_id: string
          user_id: string
        }
        Insert: {
          application_cost?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          program_name: string
          season_id: string
          user_id: string
        }
        Update: {
          application_cost?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          program_name?: string
          season_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fertilizer_programs_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      field_chemical_applications: {
        Row: {
          chemical_program_id: string
          cost_per_acre: number
          created_at: string | null
          field_cost_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          chemical_program_id: string
          cost_per_acre: number
          created_at?: string | null
          field_cost_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          chemical_program_id?: string
          cost_per_acre?: number
          created_at?: string | null
          field_cost_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_chemical_applications_chemical_program_id_fkey"
            columns: ["chemical_program_id"]
            isOneToOne: false
            referencedRelation: "chemical_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_chemical_applications_field_cost_id_fkey"
            columns: ["field_cost_id"]
            isOneToOne: false
            referencedRelation: "field_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_cost_overrides: {
        Row: {
          cost_item_name: string
          created_at: string | null
          field_id: string
          id: string
          override_value: Json
          updated_at: string | null
        }
        Insert: {
          cost_item_name: string
          created_at?: string | null
          field_id: string
          id?: string
          override_value: Json
          updated_at?: string | null
        }
        Update: {
          cost_item_name?: string
          created_at?: string | null
          field_id?: string
          id?: string
          override_value?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_cost_overrides_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      field_costs: {
        Row: {
          chemical_cost_per_acre: number | null
          created_at: string | null
          crop_insurance_cost_per_acre: number | null
          custom_services_cost_per_acre: number | null
          drying_storage_cost_per_acre: number | null
          drying_storage_per_bushel: number | null
          equipment_cost_per_acre: number | null
          fertilizer_cost_per_acre: number | null
          field_id: string
          harvest_cost_per_acre: number | null
          hauling_cost_per_acre: number | null
          hauling_per_bushel: number | null
          id: string
          labor_cost_per_acre: number | null
          other_expenses_per_acre: number | null
          planting_cost_per_acre: number | null
          seed_cost_per_acre: number | null
          seed_variety_id: string | null
          seeding_rate_override: number | null
          template_id: string | null
          tillage_cost_per_acre: number | null
          total_cost_per_acre: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chemical_cost_per_acre?: number | null
          created_at?: string | null
          crop_insurance_cost_per_acre?: number | null
          custom_services_cost_per_acre?: number | null
          drying_storage_cost_per_acre?: number | null
          drying_storage_per_bushel?: number | null
          equipment_cost_per_acre?: number | null
          fertilizer_cost_per_acre?: number | null
          field_id: string
          harvest_cost_per_acre?: number | null
          hauling_cost_per_acre?: number | null
          hauling_per_bushel?: number | null
          id?: string
          labor_cost_per_acre?: number | null
          other_expenses_per_acre?: number | null
          planting_cost_per_acre?: number | null
          seed_cost_per_acre?: number | null
          seed_variety_id?: string | null
          seeding_rate_override?: number | null
          template_id?: string | null
          tillage_cost_per_acre?: number | null
          total_cost_per_acre?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chemical_cost_per_acre?: number | null
          created_at?: string | null
          crop_insurance_cost_per_acre?: number | null
          custom_services_cost_per_acre?: number | null
          drying_storage_cost_per_acre?: number | null
          drying_storage_per_bushel?: number | null
          equipment_cost_per_acre?: number | null
          fertilizer_cost_per_acre?: number | null
          field_id?: string
          harvest_cost_per_acre?: number | null
          hauling_cost_per_acre?: number | null
          hauling_per_bushel?: number | null
          id?: string
          labor_cost_per_acre?: number | null
          other_expenses_per_acre?: number | null
          planting_cost_per_acre?: number | null
          seed_cost_per_acre?: number | null
          seed_variety_id?: string | null
          seeding_rate_override?: number | null
          template_id?: string | null
          tillage_cost_per_acre?: number | null
          total_cost_per_acre?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_costs_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_costs_seed_variety_id_fkey"
            columns: ["seed_variety_id"]
            isOneToOne: false
            referencedRelation: "seed_varieties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_costs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cost_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      field_fertilizer_applications: {
        Row: {
          application_rate: number
          cost_per_acre: number
          created_at: string | null
          fertilizer_product_id: string
          field_cost_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          application_rate: number
          cost_per_acre: number
          created_at?: string | null
          fertilizer_product_id: string
          field_cost_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          application_rate?: number
          cost_per_acre?: number
          created_at?: string | null
          fertilizer_product_id?: string
          field_cost_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_fertilizer_applications_fertilizer_product_id_fkey"
            columns: ["fertilizer_product_id"]
            isOneToOne: false
            referencedRelation: "fertilizer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_fertilizer_applications_field_cost_id_fkey"
            columns: ["field_cost_id"]
            isOneToOne: false
            referencedRelation: "field_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_yields: {
        Row: {
          created_at: string | null
          field_id: string
          harvest_date: string | null
          id: string
          moisture_percentage: number | null
          notes: string | null
          total_yield_bushels: number
          updated_at: string | null
          user_id: string
          yield_bushels_per_acre: number
        }
        Insert: {
          created_at?: string | null
          field_id: string
          harvest_date?: string | null
          id?: string
          moisture_percentage?: number | null
          notes?: string | null
          total_yield_bushels: number
          updated_at?: string | null
          user_id: string
          yield_bushels_per_acre: number
        }
        Update: {
          created_at?: string | null
          field_id?: string
          harvest_date?: string | null
          id?: string
          moisture_percentage?: number | null
          notes?: string | null
          total_yield_bushels?: number
          updated_at?: string | null
          user_id?: string
          yield_bushels_per_acre?: number
        }
        Relationships: [
          {
            foreignKeyName: "field_yields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      fields: {
        Row: {
          acreage: number
          created_at: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id: string
          land_rent_per_acre: number | null
          name: string
          notes: string | null
          property_tax_per_acre: number | null
          season_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acreage: number
          created_at?: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id?: string
          land_rent_per_acre?: number | null
          name: string
          notes?: string | null
          property_tax_per_acre?: number | null
          season_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acreage?: number
          created_at?: string | null
          crop_type?: Database["public"]["Enums"]["crop_type"]
          id?: string
          land_rent_per_acre?: number | null
          name?: string
          notes?: string | null
          property_tax_per_acre?: number | null
          season_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fields_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_chemicals: {
        Row: {
          chemical_name: string
          created_at: string | null
          default_application_rate: number | null
          default_application_rate_unit: string | null
          epa_reg_number: string | null
          id: string
          master_product_id: string | null
          price_per_unit: number
          season_id: string
          unit_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chemical_name: string
          created_at?: string | null
          default_application_rate?: number | null
          default_application_rate_unit?: string | null
          epa_reg_number?: string | null
          id?: string
          master_product_id?: string | null
          price_per_unit: number
          season_id: string
          unit_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chemical_name?: string
          created_at?: string | null
          default_application_rate?: number | null
          default_application_rate_unit?: string | null
          epa_reg_number?: string | null
          id?: string
          master_product_id?: string | null
          price_per_unit?: number
          season_id?: string
          unit_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "individual_chemicals_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_chemicals_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          entry_type: string
          farm_id: string
          id: string
          master_product_id: string
          note: string | null
          product_category: string
          quantity_delta: number
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          entry_type: string
          farm_id: string
          id?: string
          master_product_id: string
          note?: string | null
          product_category: string
          quantity_delta?: number
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          entry_type?: string
          farm_id?: string
          id?: string
          master_product_id?: string
          note?: string | null
          product_category?: string
          quantity_delta?: number
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_entries_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_entries_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      master_products: {
        Row: {
          canonical_name: string
          created_at: string | null
          farm_id: string
          id: string
          on_hand_quantity: number | null
          product_category: string
          unit_type: string
          updated_at: string | null
        }
        Insert: {
          canonical_name: string
          created_at?: string | null
          farm_id: string
          id?: string
          on_hand_quantity?: number | null
          product_category: string
          unit_type: string
          updated_at?: string | null
        }
        Update: {
          canonical_name?: string
          created_at?: string | null
          farm_id?: string
          id?: string
          on_hand_quantity?: number | null
          product_category?: string
          unit_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_products_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          corn_price_per_bushel: number | null
          created_at: string | null
          farm_id: string | null
          id: string
          is_active: boolean | null
          name: string
          soybeans_price_per_bushel: number | null
          updated_at: string | null
          user_id: string
          wheat_price_per_bushel: number | null
          year: number
        }
        Insert: {
          corn_price_per_bushel?: number | null
          created_at?: string | null
          farm_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          soybeans_price_per_bushel?: number | null
          updated_at?: string | null
          user_id: string
          wheat_price_per_bushel?: number | null
          year: number
        }
        Update: {
          corn_price_per_bushel?: number | null
          created_at?: string | null
          farm_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          soybeans_price_per_bushel?: number | null
          updated_at?: string | null
          user_id?: string
          wheat_price_per_bushel?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      seed_varieties: {
        Row: {
          created_at: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id: string
          master_product_id: string | null
          price_per_unit: number
          product_name: string
          season_id: string
          standard_seeding_rate: number | null
          unit_type: string
          units_per_bag: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crop_type: Database["public"]["Enums"]["crop_type"]
          id?: string
          master_product_id?: string | null
          price_per_unit: number
          product_name: string
          season_id: string
          standard_seeding_rate?: number | null
          unit_type: string
          units_per_bag?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          crop_type?: Database["public"]["Enums"]["crop_type"]
          id?: string
          master_product_id?: string | null
          price_per_unit?: number
          product_name?: string
          season_id?: string
          standard_seeding_rate?: number | null
          unit_type?: string
          units_per_bag?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seed_varieties_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seed_varieties_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_lines: {
        Row: {
          adjusted_quantity: number | null
          created_at: string | null
          farm_id: string
          id: string
          master_product_id: string | null
          needed_quantity: number
          on_hand_at_generation: number
          product_category: string
          product_name: string
          purchased_at: string | null
          purchased_price_per_unit: number | null
          purchased_quantity: number | null
          quoted_price_per_unit: number | null
          shopping_list_id: string
          status: string
          supplier: string | null
          unit_type: string
        }
        Insert: {
          adjusted_quantity?: number | null
          created_at?: string | null
          farm_id: string
          id?: string
          master_product_id?: string | null
          needed_quantity?: number
          on_hand_at_generation?: number
          product_category: string
          product_name: string
          purchased_at?: string | null
          purchased_price_per_unit?: number | null
          purchased_quantity?: number | null
          quoted_price_per_unit?: number | null
          shopping_list_id: string
          status?: string
          supplier?: string | null
          unit_type: string
        }
        Update: {
          adjusted_quantity?: number | null
          created_at?: string | null
          farm_id?: string
          id?: string
          master_product_id?: string | null
          needed_quantity?: number
          on_hand_at_generation?: number
          product_category?: string
          product_name?: string
          purchased_at?: string | null
          purchased_price_per_unit?: number | null
          purchased_quantity?: number | null
          quoted_price_per_unit?: number | null
          shopping_list_id?: string
          status?: string
          supplier?: string | null
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_lines_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_lines_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_lines_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string | null
          farm_id: string
          id: string
          label: string
          product_category: string
          season_id: string
        }
        Insert: {
          created_at?: string | null
          farm_id: string
          id?: string
          label: string
          product_category: string
          season_id: string
        }
        Update: {
          created_at?: string | null
          farm_id?: string
          id?: string
          label?: string
          product_category?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          accepted_at: string | null
          email: string
          farm_id: string | null
          id: string
          invited_at: string | null
          invited_user_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          season_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          farm_id?: string | null
          id?: string
          invited_at?: string | null
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          season_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          farm_id?: string | null
          id?: string
          invited_at?: string | null
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          season_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          email: string
          farm_name: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          farm_name?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          farm_name?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      work_order_fields: {
        Row: {
          acreage: number
          created_at: string | null
          field_id: string | null
          field_name: string
          id: string
          work_order_id: string
        }
        Insert: {
          acreage?: number
          created_at?: string | null
          field_id?: string | null
          field_name: string
          id?: string
          work_order_id: string
        }
        Update: {
          acreage?: number
          created_at?: string | null
          field_id?: string | null
          field_name?: string
          id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_fields_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_lines: {
        Row: {
          chemical_name: string
          created_at: string | null
          id: string
          master_product_id: string | null
          price_per_unit: number | null
          price_unit: string | null
          rate_per_acre: number
          rate_unit: string
          sort_order: number
          total_needed: number
          work_order_id: string
        }
        Insert: {
          chemical_name: string
          created_at?: string | null
          id?: string
          master_product_id?: string | null
          price_per_unit?: number | null
          price_unit?: string | null
          rate_per_acre?: number
          rate_unit?: string
          sort_order?: number
          total_needed?: number
          work_order_id: string
        }
        Update: {
          chemical_name?: string
          created_at?: string | null
          id?: string
          master_product_id?: string | null
          price_per_unit?: number | null
          price_unit?: string | null
          rate_per_acre?: number
          rate_unit?: string
          sort_order?: number
          total_needed?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_lines_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          applied_at: string | null
          created_at: string | null
          created_by: string
          crop_type: string
          farm_id: string
          id: string
          program_id: string | null
          program_name: string
          season_id: string
          spray_volume_gal_per_acre: number | null
          status: string
          total_acreage: number
          unapplied_at: string | null
          updated_at: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string | null
          created_by: string
          crop_type: string
          farm_id: string
          id?: string
          program_id?: string | null
          program_name: string
          season_id: string
          spray_volume_gal_per_acre?: number | null
          status?: string
          total_acreage?: number
          unapplied_at?: string | null
          updated_at?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string | null
          created_by?: string
          crop_type?: string
          farm_id?: string
          id?: string
          program_id?: string | null
          program_name?: string
          season_id?: string
          spray_volume_gal_per_acre?: number | null
          status?: string
          total_acreage?: number
          unapplied_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "chemical_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      yield_and_price: {
        Row: {
          cost_per_bushel: number | null
          created_at: string | null
          field_id: string
          gross_revenue_per_acre: number | null
          harvest_date: string | null
          id: string
          notes: string | null
          price_per_bushel: number | null
          profit_per_acre: number | null
          sale_date: string | null
          updated_at: string | null
          user_id: string
          yield_per_acre: number | null
        }
        Insert: {
          cost_per_bushel?: number | null
          created_at?: string | null
          field_id: string
          gross_revenue_per_acre?: number | null
          harvest_date?: string | null
          id?: string
          notes?: string | null
          price_per_bushel?: number | null
          profit_per_acre?: number | null
          sale_date?: string | null
          updated_at?: string | null
          user_id: string
          yield_per_acre?: number | null
        }
        Update: {
          cost_per_bushel?: number | null
          created_at?: string | null
          field_id?: string
          gross_revenue_per_acre?: number | null
          harvest_date?: string | null
          id?: string
          notes?: string | null
          price_per_bushel?: number | null
          profit_per_acre?: number | null
          sale_date?: string | null
          updated_at?: string | null
          user_id?: string
          yield_per_acre?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yield_and_price_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_work_order: {
        Args: { p_quantities: Json; p_work_order_id: string }
        Returns: {
          applied_at: string | null
          created_at: string | null
          created_by: string
          crop_type: string
          farm_id: string
          id: string
          program_id: string | null
          program_name: string
          season_id: string
          spray_volume_gal_per_acre: number | null
          status: string
          total_acreage: number
          unapplied_at: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_edit_farm: { Args: { p_farm_id: string }; Returns: boolean }
      can_view_farm: { Args: { p_farm_id: string }; Returns: boolean }
      record_purchase: {
        Args: {
          p_line_id: string
          p_price_per_unit: number
          p_quantity: number
          p_quantity_stock_units?: number
        }
        Returns: Json
      }
      respond_to_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: {
          accepted_at: string | null
          email: string
          farm_id: string | null
          id: string
          invited_at: string | null
          invited_user_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          season_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "team_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_work_order: { Args: { p_payload: Json }; Returns: string }
      set_active_season: { Args: { p_season_id: string }; Returns: undefined }
      unapply_work_order: {
        Args: { p_quantities: Json; p_work_order_id: string }
        Returns: {
          applied_at: string | null
          created_at: string | null
          created_by: string
          crop_type: string
          farm_id: string
          id: string
          program_id: string | null
          program_name: string
          season_id: string
          spray_volume_gal_per_acre: number | null
          status: string
          total_acreage: number
          unapplied_at: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      crop_type: "corn" | "soybeans" | "wheat"
      invitation_status: "pending" | "accepted" | "declined"
      user_role: "admin" | "editor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      crop_type: ["corn", "soybeans", "wheat"],
      invitation_status: ["pending", "accepted", "declined"],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const

// ---------------------------------------------------------------------------
// Convenience aliases used across the app.
//
// The first three mirror real Postgres enums, so they are derived from the
// generated Enums block rather than restated — restating them by hand is how
// this file drifted before (see CLAUDE.md guardrail 6).
//
// The remaining four are NOT enums: they are text columns with CHECK
// constraints, so the generator cannot emit them and they must be maintained
// here. Keep them in step with the constraints in supabase/migrations.
// ---------------------------------------------------------------------------

export type CropType = Database['public']['Enums']['crop_type'];
export type UserRole = Database['public']['Enums']['user_role'];
export type InvitationStatus = Database['public']['Enums']['invitation_status'];

export type ProductCategory = 'chemical' | 'fertilizer' | 'seed';
export type LedgerEntryType = 'purchase' | 'consumption' | 'manual_adjustment' | 'reversal';
export type LedgerSourceType = 'shopping_list_line' | 'work_order' | 'manual';
export type WorkOrderStatus = 'draft' | 'applied' | 'unapplied';
