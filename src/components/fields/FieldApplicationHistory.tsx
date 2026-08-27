import { useEffect, useState } from 'react';
import { Calendar, Droplets, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AppliedWorkOrder {
  id: string;
  program_name: string;
  crop_type: string;
  applied_at: string;
  total_acreage: number;
  field_acreage: number;
  lines: Array<{
    chemical_name: string;
    rate_per_acre: number;
    rate_unit: string;
    total_needed: number;
  }>;
}

interface FieldApplicationHistoryProps {
  fieldId: string;
}

export function FieldApplicationHistory({ fieldId }: FieldApplicationHistoryProps) {
  const [workOrders, setWorkOrders] = useState<AppliedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplicationHistory();
  }, [fieldId]);

  const loadApplicationHistory = async () => {
    setLoading(true);
    try {
      const { data: fieldLinks, error: linkErr } = await supabase
        .from('work_order_fields')
        .select('work_order_id, acreage')
        .eq('field_id', fieldId);

      if (linkErr || !fieldLinks || fieldLinks.length === 0) {
        setWorkOrders([]);
        return;
      }

      const workOrderIds = fieldLinks.map((l) => l.work_order_id);
      const acreageMap = new Map(fieldLinks.map((l) => [l.work_order_id, Number(l.acreage)]));

      const { data: orders, error: ordersErr } = await supabase
        .from('work_orders')
        .select(`
          id, program_name, crop_type, applied_at, total_acreage,
          work_order_lines ( chemical_name, rate_per_acre, rate_unit, total_needed, sort_order )
        `)
        .in('id', workOrderIds)
        .eq('status', 'applied')
        .order('applied_at', { ascending: false });

      if (ordersErr || !orders) {
        setWorkOrders([]);
        return;
      }

      const mapped: AppliedWorkOrder[] = orders.map((wo: any) => ({
        id: wo.id,
        program_name: wo.program_name,
        crop_type: wo.crop_type,
        applied_at: wo.applied_at,
        total_acreage: Number(wo.total_acreage),
        field_acreage: acreageMap.get(wo.id) ?? 0,
        lines: (wo.work_order_lines ?? [])
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((l: any) => ({
            chemical_name: l.chemical_name,
            rate_per_acre: Number(l.rate_per_acre),
            rate_unit: l.rate_unit,
            total_needed: Number(l.total_needed),
          })),
      }));

      setWorkOrders(mapped);
    } catch (err) {
      console.error('Error loading application history:', err);
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Application History</h2>
          </div>
        </div>
        <div className="p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">Application History</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Spray applications completed on this field
        </p>
      </div>

      {workOrders.length === 0 ? (
        <div className="p-6 text-center">
          <Droplets className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            No spray applications recorded for this field yet.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Applied work orders from the Spray Planner will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {workOrders.map((wo) => (
            <div key={wo.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{wo.program_name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(wo.applied_at)}
                    </span>
                    <span>{wo.field_acreage} acres treated</span>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-700 capitalize">
                  {wo.crop_type}
                </span>
              </div>

              {wo.lines.length > 0 && (
                <div className="mt-2 bg-gray-50 rounded-md px-3 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs">
                        <th className="text-left font-medium pb-1">Chemical</th>
                        <th className="text-right font-medium pb-1">Rate</th>
                        <th className="text-right font-medium pb-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wo.lines.map((line, idx) => (
                        <tr key={idx} className="text-gray-700">
                          <td className="py-0.5">{line.chemical_name}</td>
                          <td className="py-0.5 text-right whitespace-nowrap">
                            {line.rate_per_acre} {line.rate_unit}/ac
                          </td>
                          <td className="py-0.5 text-right whitespace-nowrap">
                            {line.total_needed.toFixed(2)} {line.rate_unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
