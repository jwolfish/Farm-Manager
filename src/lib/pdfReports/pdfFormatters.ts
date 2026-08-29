import { CropType } from '../database.types';
import { esc } from '../htmlEscape';
import { CostBreakdown } from '../reportTypes';

export const COST_CATEGORY_LABELS: Record<keyof CostBreakdown, string> = {
  seed: 'Seed',
  fertilizer: 'Fertilizer',
  chemical: 'Chemical',
  tillage: 'Tillage',
  planting: 'Planting',
  harvest: 'Harvest',
  equipment: 'Equipment',
  customServices: 'Custom Services',
  labor: 'Labor',
  cropInsurance: 'Crop Insurance',
  dryingStorage: 'Drying/Storage',
  hauling: 'Hauling',
  landRent: 'Land Rent',
  propertyTax: 'Property Tax',
  other: 'Other',
};

export const COLORS = {
  revenue: '#16a34a',
  cost: '#dc2626',
  profit: '#2563eb',
  seasonA: '#2563eb',
  seasonB: '#16a34a',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
};

export const PIE_COLORS = [
  '#16a34a', '#2563eb', '#d97706', '#dc2626', '#0891b2',
  '#db2777', '#65a30d', '#f97316', '#14b8a6', '#f59e0b',
  '#ef4444', '#10b981', '#84cc16', '#06b6d4', '#f43f5e',
];

export const CROP_LABELS_PDF: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

export const CROP_COLORS_PDF: Record<CropType, string> = {
  corn: '#f59e0b',
  soybeans: '#16a34a',
  wheat: '#d97706',
};

export function fmt(v: number): string {
  if (v < 0) return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function fmtAcre(v: number): string {
  return `${fmt(v)}/ac`;
}

export function fmtFull(v: number): string {
  if (v < 0) return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtBu(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' bu';
}

export function pdfHeader(title: string, farmName: string | null | undefined, subtitle: string, now: string): string {
  return `
  <div class="report-header">
    <div class="report-header-left">
      <div class="logo-mark">
        <div class="dot">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10"/>
            <path d="M12 2v20"/>
            <path d="M2 12h20"/>
          </svg>
        </div>
        <span class="app-name">Farm Tracker</span>
      </div>
      ${farmName ? `<div class="farm-name">${esc(farmName)}</div>` : ''}
      <h1>${esc(title)}</h1>
    </div>
    <div class="report-header-right">
      <div class="generated">Generated ${now}</div>
      <div class="generated">${esc(subtitle)}</div>
    </div>
  </div>`;
}

export function openPDF(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (newWin) {
    newWin.addEventListener('load', () => {
      newWin.print();
      URL.revokeObjectURL(url);
    });
  }
}
