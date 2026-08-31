import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Truck, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadContractData,
  deleteContract,
  deleteLoad,
  type Contract,
  type ContractData,
  type FertilizerProduct,
  type Load,
} from '../../lib/fertilizerContracts';
import {
  rollUpProduct,
  sumSeasonTotals,
  type LoadLineRow,
} from '../../lib/fertilizerContractMath';
import { BookingModal } from './BookingModal';
import { LoadTicketModal } from './LoadTicketModal';

/**
 * Fertilizer Contracts — F-4.
 *
 * Card-first rather than table-first, deliberately: 20+ components in this app
 * render a raw <table>, and those are the mobile retrofit burden. New screens do
 * not add to it.
 */

const num = (n: number, dp = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Load lines grouped by product, optionally ignoring one ticket.
 *
 * The exclusion matters when a ticket is being EDITED: its own delivery is
 * already in the totals, so counting it would report far less room left on the
 * booking than there really is, and the modal would offer to split a load that
 * fits perfectly well.
 */
function groupLoadLines(loads: Load[], excludeLoadId: string | null): Map<string, LoadLineRow[]> {
  const map = new Map<string, LoadLineRow[]>();
  for (const load of loads) {
    if (load.id === excludeLoadId) continue;
    for (const line of load.lines) {
      const list = map.get(line.productId) ?? [];
      list.push({ contractId: line.contractId, quantity: line.quantity, unitType: line.unitType });
      map.set(line.productId, list);
    }
  }
  return map;
}

interface Props {
  seasonId: string;
  readOnly?: boolean;
  /**
   * Called after any write that can move `fertilizer_products.price_per_unit`
   * through the F-3 trigger. The Products page caches each tab's rows, so
   * without this the Fertilizers tab keeps showing the pre-contract price —
   * F-4a fault 4, seen live as $550 on screen against $590 in the database.
   */
  onPricesChanged?: () => void;
}

export function FertilizerContractsTab({ seasonId, readOnly, onPricesChanged }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [booking, setBooking] = useState<{ product: FertilizerProduct; existing: Contract | null; suggested: number | null } | null>(null);
  const [ticket, setTicket] = useState<{ existing: Load | null; productId?: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadContractData(seasonId));
    } catch (err) {
      // A failed read must say so rather than render an empty, reassuring page.
      setError(err instanceof Error ? err.message : 'Could not load fertilizer contracts.');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const season = useMemo(() => sumSeasonTotals(data?.loads ?? []), [data]);

  const cards = useMemo(() => {
    if (!data) return [];
    const linesByProduct = groupLoadLines(data.loads, null);

    const needByProduct = new Map(data.needs.map((n) => [n.productId, n]));

    // A product earns a card if it is planned, booked, or delivered against.
    const ids = new Set<string>([
      ...data.needs.map((n) => n.productId),
      ...data.contracts.map((c) => c.productId),
      ...[...linesByProduct.keys()],
    ]);

    return data.products
      .filter((p) => ids.has(p.id))
      .map((product) => {
        const contracts = data.contracts.filter((c) => c.productId === product.id);
        const rollup = rollUpProduct(
          contracts,
          linesByProduct.get(product.id) ?? [],
          product.unit_type,
          product.density_lb_per_gal
        );
        return { product, rollup, need: needByProduct.get(product.id) ?? null };
      });
  }, [data]);

  /**
   * Tons still to call on each booking, in that product's unit, with the ticket
   * currently open for editing left out of the sums.
   */
  const remainingByContract = useMemo(() => {
    const out: Record<string, number> = {};
    if (!data) return out;
    const linesByProduct = groupLoadLines(data.loads, ticket?.existing?.id ?? null);
    for (const product of data.products) {
      const forProduct = data.contracts.filter((c) => c.productId === product.id);
      if (forProduct.length === 0) continue;
      const rollup = rollUpProduct(
        forProduct,
        linesByProduct.get(product.id) ?? [],
        product.unit_type,
        product.density_lb_per_gal
      );
      for (const c of rollup.contracts) out[c.id] = c.remaining;
    }
    return out;
  }, [data, ticket]);

  const handleDeleteContract = async (contract: Contract) => {
    if (!user) return;
    setActionError(null);
    setBusyId(contract.id);
    const result = await deleteContract(contract.id, user.id);
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    // Removing a priced booking re-blends the average, so the Fertilizers tab's
    // cached price is now stale.
    onPricesChanged?.();
    await reload();
  };

  const handleDeleteLoad = async (load: Load) => {
    setActionError(null);
    setBusyId(load.id);
    const result = await deleteLoad(load.id);
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    await reload();
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-500">Loading fertilizer contracts…</div>;
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={() => void reload()} className="mt-3 py-2 px-4 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-sm text-red-700 font-medium shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Season strip: tonnage counts down while delivery fees count up. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Contracted" value={`${num(cards.reduce((s, c) => s + c.rollup.contracted, 0))}`} />
        <Tile label="Delivered" value={`${num(cards.reduce((s, c) => s + c.rollup.delivered, 0))}`} />
        <Tile label="Left to call" value={`${num(cards.reduce((s, c) => s + c.rollup.remaining, 0))}`} />
        <Tile label={`Delivery fees · ${season.loadCount} loads`} value={money(season.deliveryFees)} />
      </div>

      {!readOnly && data && data.products.length > 0 && (
        <button
          onClick={() => setTicket({ existing: null })}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          <Truck className="w-4 h-4" /> Record a load
        </button>
      )}

      {cards.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          <p>No fertilizer to track yet.</p>
          <p className="text-sm mt-1">
            Add fertilizer products and put them in a program, and their planned tonnage will
            show up here.
          </p>
        </div>
      )}

      {cards.map(({ product, rollup, need }) => {
        const pct = rollup.contracted > 0
          ? Math.min(100, Math.max(0, (rollup.delivered / rollup.contracted) * 100))
          : 0;
        const over = rollup.remaining < 0;

        return (
          <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">{product.product_name}</h3>
                <p className="text-sm text-gray-500">
                  {need ? `Plan ${num(need.total)} ${product.unit_type}` : 'Not in any program'}
                  {' · '}Contracted {num(rollup.contracted)}
                  {' · '}Delivered {num(rollup.delivered)}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold ${over ? 'text-red-600' : 'text-gray-900'}`}>
                  {num(rollup.remaining)} {product.unit_type}
                </p>
                <p className="text-xs text-gray-500">{over ? 'over contract' : 'left to call'}</p>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full ${over ? 'bg-red-500' : 'bg-green-600'}`}
                style={{ width: `${over ? 100 : pct}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-gray-700">
              {rollup.blendedPrice !== null ? (
                <>
                  Blended cost <span className="font-semibold">{money(rollup.blendedPrice)}</span>
                  /{product.unit_type}
                  {rollup.deliveredWeightedPrice !== null &&
                    rollup.deliveredWeightedPrice !== rollup.blendedPrice && (
                      <span className="text-gray-500">
                        {' '}(delivered-weighted {money(rollup.deliveredWeightedPrice)})
                      </span>
                    )}
                </>
              ) : (
                <span className="text-gray-500">No priced booking yet — cost still {money(product.price_per_unit)}/{product.unit_type}</span>
              )}
            </p>

            {rollup.unattributedDelivered > 0 && (
              <p className="mt-1 text-sm text-amber-700">
                {num(rollup.unattributedDelivered)} {product.unit_type} delivered against no booking.
              </p>
            )}

            {rollup.issues.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Some deliveries are not counted
                </p>
                <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                  {rollup.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {rollup.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap py-2 border-t border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {c.label || (c.kind === 'spot' ? 'Spot buy' : 'Booking')}
                      {c.kind === 'spot' && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">spot</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {num(c.contractedQuantity)} {product.unit_type}
                      {c.pricePerUnit !== null ? ` @ ${money(c.pricePerUnit)}` : ' — price not set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-sm mr-2 ${c.remaining < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {num(c.remaining)} left
                    </span>
                    {!readOnly && (
                      <>
                        <button
                          aria-label="Edit booking"
                          onClick={() => setBooking({ product, existing: data!.contracts.find((x) => x.id === c.id)!, suggested: null })}
                          className="p-3 text-gray-400 hover:text-gray-700 rounded-lg"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          aria-label="Delete booking"
                          disabled={busyId === c.id}
                          onClick={() => void handleDeleteContract(data!.contracts.find((x) => x.id === c.id)!)}
                          className="p-3 text-gray-400 hover:text-red-600 rounded-lg disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setBooking({ product, existing: null, suggested: need && rollup.contracted === 0 ? need.total : null })
                  }
                  className="inline-flex items-center gap-1 py-3 px-4 text-sm font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-50"
                >
                  <Plus className="w-4 h-4" /> Add booking
                </button>
                <button
                  onClick={() => setTicket({ existing: null, productId: product.id })}
                  className="inline-flex items-center gap-1 py-3 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Truck className="w-4 h-4" /> Add load
                </button>
              </div>
            )}
          </div>
        );
      })}

      {data && data.loads.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Load tickets</h3>
          <div className="space-y-2">
            {data.loads.map((load) => (
              <div key={load.id} className="flex items-start justify-between gap-3 flex-wrap py-2 border-t border-gray-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {load.deliveredOn}
                    {load.ticketNumber ? ` · #${load.ticketNumber}` : ''}
                    {load.loadType ? ` · ${load.loadType}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {load.lines.map((l) => {
                      const p = data.products.find((x) => x.id === l.productId);
                      return `${num(l.quantity)} ${l.unitType} ${p?.product_name ?? ''}`;
                    }).join(' · ')}
                    {load.deliveryFee > 0 ? ` · fee ${money(load.deliveryFee)}` : ''}
                  </p>
                  {load.notes && <p className="text-xs text-gray-500 italic mt-0.5">{load.notes}</p>}
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      aria-label="Edit load"
                      onClick={() => setTicket({ existing: load })}
                      className="p-3 text-gray-400 hover:text-gray-700 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      aria-label="Delete load"
                      disabled={busyId === load.id}
                      onClick={() => void handleDeleteLoad(load)}
                      className="p-3 text-gray-400 hover:text-red-600 rounded-lg disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {booking && user && (
        <BookingModal
          open
          onClose={() => setBooking(null)}
          onSaved={() => { setBooking(null); onPricesChanged?.(); void reload(); }}
          seasonId={seasonId}
          userId={user.id}
          product={booking.product}
          existing={booking.existing}
          suggestedQuantity={booking.suggested}
        />
      )}

      {ticket && data && user && (
        <LoadTicketModal
          open
          onClose={() => setTicket(null)}
          onSaved={({ pricesChanged }) => {
            setTicket(null);
            // A delivery on its own moves no money; a priced spot buy entered on
            // the ticket does.
            if (pricesChanged) onPricesChanged?.();
            void reload();
          }}
          seasonId={seasonId}
          userId={user.id}
          products={data.products}
          contracts={data.contracts}
          remainingByContract={remainingByContract}
          existing={ticket.existing}
          defaultProductId={ticket.productId}
        />
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
