import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { supabase } from '../lib/supabase';
import { useReportData } from '../hooks/useReportData';
import { ProfitabilityReports } from './reports/ProfitabilityReports';
import { FieldPerformanceReports } from './reports/FieldPerformanceReports';
import { SalesReports } from './reports/SalesReports';
import { CostEfficiencyReports } from './reports/CostEfficiencyReports';
import { InSeasonReports } from './reports/InSeasonReports';
import {
  DollarSign,
  MapPin,
  TrendingUp,
  Calculator,
  Tractor,
  ChevronRight,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: typeof DollarSign;
  color: string;
  bgColor: string;
  borderColor: string;
  available: boolean;
  reportCount: number;
  availableCount: number;
}

const CATEGORIES: Category[] = [
  {
    id: 'profitability',
    name: 'Profitability & Revenue',
    description: 'Year-over-year profit summaries, revenue vs. cost trends, and cost category breakdowns',
    icon: DollarSign,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    available: true,
    reportCount: 3,
    availableCount: 3,
  },
  {
    id: 'fields',
    name: 'Field Performance',
    description: 'Per-field cost comparisons, yield rankings, and return on investment by field',
    icon: MapPin,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    available: true,
    reportCount: 3,
    availableCount: 3,
  },
  {
    id: 'sales',
    name: 'Sales & Marketing',
    description: 'Commodity sale analysis, pricing performance, and buyer destination breakdowns',
    icon: TrendingUp,
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    available: true,
    reportCount: 3,
    availableCount: 3,
  },
  {
    id: 'costs',
    name: 'Cost Efficiency',
    description: 'Cost per bushel, input efficiency ratios, and break-even analysis',
    icon: Calculator,
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    available: true,
    reportCount: 3,
    availableCount: 3,
  },
  {
    id: 'inseason',
    name: 'In-Season Operations',
    description: 'Seed bag requirements by field, planting plans, and operational checklists',
    icon: Tractor,
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    available: true,
    reportCount: 1,
    availableCount: 1,
  },
];

interface ReportsProps {
  currentSeasonId: string | null;
}

export function Reports({ currentSeasonId }: ReportsProps) {
  const { user } = useAuth();
  const { effectiveUserId, activeFarmId } = useFarm();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [farmName, setFarmName] = useState<string | null>(null);
  // Scoped by farm, not by viewer: a shared farm's rows carry the owner's id.
  const { data, fieldData, salesData, loading, error } = useReportData(activeFarmId);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('farm_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.farm_name) setFarmName(data.farm_name);
      });
  }, [user?.id]);

  const activecat = CATEGORIES.find((c) => c.id === activeCategory);

  if (activeCategory && activecat) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            All Reports
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${activecat.bgColor}`}>
              <activecat.icon className={`w-6 h-6 ${activecat.color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{activecat.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{activecat.description}</p>
            </div>
          </div>
        </div>

        {activeCategory === 'profitability' && (
          <ProfitabilityReports data={data} farmName={farmName} loading={loading} error={error} currentSeasonId={currentSeasonId} />
        )}
        {activeCategory === 'fields' && (
          <FieldPerformanceReports fieldData={fieldData} seasonData={data} farmName={farmName} loading={loading} error={error} currentSeasonId={currentSeasonId} />
        )}
        {activeCategory === 'sales' && (
          <SalesReports salesData={salesData} seasonData={data} farmName={farmName} loading={loading} error={error} currentSeasonId={currentSeasonId} />
        )}
        {activeCategory === 'costs' && (
          <CostEfficiencyReports fieldData={fieldData} seasonData={data} farmName={farmName} loading={loading} error={error} currentSeasonId={currentSeasonId} />
        )}
        {activeCategory === 'inseason' && (
          <InSeasonReports currentSeasonId={currentSeasonId} effectiveUserId={effectiveUserId} loading={loading} error={error} />
        )}

      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        {farmName && <p className="text-sm text-green-600 font-medium mt-0.5">{farmName}</p>}
        <p className="text-gray-500 mt-1">
          Analyze your farm's financial performance with detailed reports and visualizations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => cat.available ? setActiveCategory(cat.id) : undefined}
              className={`text-left p-6 rounded-xl border-2 transition-all group ${
                cat.available
                  ? `${cat.borderColor} hover:shadow-md hover:-translate-y-0.5 cursor-pointer bg-white`
                  : 'border-gray-100 bg-gray-50 cursor-default'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${cat.available ? cat.bgColor : 'bg-gray-100'}`}>
                  <Icon className={`w-6 h-6 ${cat.available ? cat.color : 'text-gray-400'}`} />
                </div>
                {cat.available ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
                    View Reports
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Coming Soon</span>
                )}
              </div>

              <h3 className={`font-semibold text-lg mb-1.5 ${cat.available ? 'text-gray-900' : 'text-gray-400'}`}>
                {cat.name}
              </h3>
              <p className={`text-sm leading-relaxed mb-4 ${cat.available ? 'text-gray-500' : 'text-gray-400'}`}>
                {cat.description}
              </p>

            </button>
          );
        })}
      </div>

      <div className="mt-10 bg-green-50 border border-green-200 rounded-xl p-6">
        <h3 className="font-semibold text-green-900 mb-1">About These Reports</h3>
        <p className="text-sm text-green-700 leading-relaxed">
          Reports pull data from all your seasons automatically. Profitability reports use cost records from your
          fields combined with yield data and commodity sales. For the most accurate results, make sure each field
          has a cost template applied and yield data entered.
        </p>
      </div>
    </div>
  );
}
