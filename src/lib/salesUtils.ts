import type { CropType } from './database.types';

export const cropConfig: Record<CropType, {
  label: string;
  headerBg: string;
  headerText: string;
  headerBorder: string;
  summaryBg: string;
  summaryBorder: string;
  summaryText: string;
  summaryValue: string;
}> = {
  corn: {
    label: 'Corn',
    headerBg: 'bg-yellow-100',
    headerText: 'text-yellow-800',
    headerBorder: 'border-yellow-200',
    summaryBg: 'bg-gradient-to-br from-yellow-50 to-yellow-100',
    summaryBorder: 'border-yellow-200',
    summaryText: 'text-yellow-800',
    summaryValue: 'text-yellow-900',
  },
  soybeans: {
    label: 'Soybeans',
    headerBg: 'bg-green-100',
    headerText: 'text-green-800',
    headerBorder: 'border-green-200',
    summaryBg: 'bg-gradient-to-br from-green-50 to-green-100',
    summaryBorder: 'border-green-200',
    summaryText: 'text-green-800',
    summaryValue: 'text-green-900',
  },
  wheat: {
    label: 'Wheat',
    headerBg: 'bg-amber-100',
    headerText: 'text-amber-800',
    headerBorder: 'border-amber-200',
    summaryBg: 'bg-gradient-to-br from-amber-50 to-amber-100',
    summaryBorder: 'border-amber-200',
    summaryText: 'text-amber-800',
    summaryValue: 'text-amber-900',
  },
};

export function formatDeliveryMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatBushels(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  futures: 'Futures',
  forward_contract: 'Forward Contract',
  options_put: 'Put Option',
  htc: 'HTC',
  basis_contract: 'Basis Contract',
};
