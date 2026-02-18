import { CropType } from './database.types';

export interface FieldPerformanceSummary {
  fieldId: string;
  fieldName: string;
  cropType: CropType;
  acres: number;
  seasonId: string;
  seasonName: string;
  year: number;
  costPerAcre: number;
  totalCost: number;
  yieldPerAcre: number | null;
  totalYield: number | null;
  revenuePerAcre: number | null;
  totalRevenue: number | null;
  netProfitPerAcre: number | null;
  totalNetProfit: number | null;
  costBreakdown: CostBreakdown;
}

export interface SaleRecord {
  id: string;
  seasonId: string;
  seasonName: string;
  year: number;
  cropType: CropType;
  saleDate: string;
  deliveryMonth: string;
  destination: string;
  bushelsSold: number;
  pricePerBushel: number;
  totalRevenue: number;
  notes: string | null;
}

export interface SeasonSummary {
  seasonId: string;
  seasonName: string;
  year: number;
  cropBreakdown: CropSummary[];
  totalRevenue: number;
  totalCost: number;
  totalNetProfit: number;
  totalAcres: number;
}

export interface CropSummary {
  cropType: CropType;
  acres: number;
  revenuePerAcre: number;
  costPerAcre: number;
  netProfitPerAcre: number;
  totalRevenue: number;
  totalCost: number;
  totalNetProfit: number;
  yieldPerAcre: number | null;
  pricePerBushel: number | null;
  costBreakdown: CostBreakdown;
}

export interface CostBreakdown {
  seed: number;
  fertilizer: number;
  chemical: number;
  tillage: number;
  planting: number;
  harvest: number;
  equipment: number;
  customServices: number;
  labor: number;
  cropInsurance: number;
  dryingStorage: number;
  hauling: number;
  landRent: number;
  propertyTax: number;
  other: number;
}

export interface ReportCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  reports: ReportDefinition[];
  available: boolean;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  available: boolean;
}
