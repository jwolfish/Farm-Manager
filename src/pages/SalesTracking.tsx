import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { SalesCommoditySection } from '../components/SalesCommoditySection';
import { HedgeCommoditySection } from '../components/HedgeCommoditySection';
import { useSalesTracking } from '../hooks/useSalesTracking';

interface SalesTrackingProps {
  seasonId: string | null;
  readOnly?: boolean;
}

type Tab = 'sales' | 'hedges';

export function SalesTracking({ seasonId }: SalesTrackingProps) {
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const {
    sales, hedges, loading,
    salesByCrop, hedgesByCrop,
    handleAddSale, handleUpdateSale, handleDeleteSale,
    handleAddHedge, handleUpdateHedge, handleDeleteHedge,
  } = useSalesTracking(seasonId);

  const allTotalBushels = sales.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
  const allTotalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
  const allHedgedBushels = hedges.reduce((sum, h) => sum + Number(h.bushels_hedged), 0);
  const allHedgedValue = hedges.reduce((sum, h) => sum + Number(h.bushels_hedged) * Number(h.net_price), 0);

  if (!seasonId) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to get started</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        {activeTab === 'sales' ? (
          <TrendingUp className="w-7 h-7 text-green-600" />
        ) : (
          <TrendingDown className="w-7 h-7 text-blue-600" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales & Hedging</h1>
          <p className="text-sm text-gray-600">Track commodity sales and hedge positions</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'sales' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Cash Sales
          {sales.length > 0 && (
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'sales' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {sales.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('hedges')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'hedges' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Hedge Positions
          {hedges.length > 0 && (
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'hedges' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {hedges.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'sales' && (
        <>
          {sales.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Sales</div>
                <div className="text-3xl font-bold text-gray-900">{sales.length}</div>
                <div className="text-xs text-gray-500">across all commodities</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Bushels Sold</div>
                <div className="text-3xl font-bold text-gray-900">
                  {allTotalBushels.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Sales Revenue</div>
                <div className="text-3xl font-bold text-green-700">
                  ${allTotalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
            </div>
          )}
          <SalesCommoditySection cropType="corn" sales={salesByCrop('corn')} onAddSale={handleAddSale} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} />
          <SalesCommoditySection cropType="soybeans" sales={salesByCrop('soybeans')} onAddSale={handleAddSale} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} />
          <SalesCommoditySection cropType="wheat" sales={salesByCrop('wheat')} onAddSale={handleAddSale} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} />
        </>
      )}

      {activeTab === 'hedges' && (
        <>
          {hedges.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Positions</div>
                <div className="text-3xl font-bold text-gray-900">{hedges.length}</div>
                <div className="text-xs text-gray-500">across all commodities</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Bushels Hedged</div>
                <div className="text-3xl font-bold text-gray-900">
                  {allHedgedBushels.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Locked-In Value</div>
                <div className="text-3xl font-bold text-blue-700">
                  ${allHedgedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">at net price</div>
              </div>
            </div>
          )}
          <HedgeCommoditySection cropType="corn" hedges={hedgesByCrop('corn')} onAddHedge={handleAddHedge} onUpdateHedge={handleUpdateHedge} onDeleteHedge={handleDeleteHedge} />
          <HedgeCommoditySection cropType="soybeans" hedges={hedgesByCrop('soybeans')} onAddHedge={handleAddHedge} onUpdateHedge={handleUpdateHedge} onDeleteHedge={handleDeleteHedge} />
          <HedgeCommoditySection cropType="wheat" hedges={hedgesByCrop('wheat')} onAddHedge={handleAddHedge} onUpdateHedge={handleUpdateHedge} onDeleteHedge={handleDeleteHedge} />
        </>
      )}
    </div>
  );
}
