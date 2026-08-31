import { useState } from 'react';
import { Plus, Trash2, Split, AlertTriangle, X } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import { convertProductUnits, describeConversionFailure } from '../../lib/unitConversions';
import { planLineDraw, type DrawSplit } from '../../lib/fertilizerContractMath';
import {
  saveLoad,
  type Contract,
  type FertilizerProduct,
  type Load,
  type LoadLineInput,
} from '../../lib/fertilizerContracts';

/**
 * Preset load sizes. These exist so a full semi is two taps rather than typing
 * in a truck — the same reason the number fields raise a numeric keypad.
 */
const LOAD_TYPES: Array<{ value: string; label: string; tons: number | null }> = [
  { value: 'semi', label: 'Semi', tons: 24 },
  { value: 'truck', label: 'Truck', tons: 12 },
  { value: 'spreader', label: 'Spreader', tons: 4 },
  { value: 'tender', label: 'Tender', tons: null },
  { value: 'pickup', label: 'Pickup', tons: null },
  { value: 'other', label: 'Other', tons: null },
];

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface DraftSpot {
  label: string;
  price: string;
}

interface DraftLine {
  key: string;
  productId: string;
  contractId: string;
  quantity: string;
  unitType: string;
  /**
   * Set when these tons are being bought on the spot right here on the ticket,
   * rather than drawn from an existing booking.
   */
  spot: DraftSpot | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `pricesChanged` is true when the ticket created a priced spot buy. */
  onSaved: (result: { pricesChanged: boolean }) => void;
  seasonId: string;
  userId: string;
  products: FertilizerProduct[];
  contracts: Contract[];
  /**
   * Tons still to call on each booking, in that product's unit, with the ticket
   * being edited excluded — otherwise editing a load would count its own
   * delivery against the booking and report far less room than there is.
   */
  remainingByContract: Record<string, number>;
  existing?: Load | null;
  /** Card the user tapped "Add load" on, so the first line is prefilled. */
  defaultProductId?: string;
}

let lineKey = 0;
const newKey = () => `line-${lineKey++}`;

export function LoadTicketModal({
  open, onClose, onSaved, seasonId, userId, products, contracts,
  remainingByContract, existing, defaultProductId,
}: Props) {
  const firstProduct = defaultProductId ?? products[0]?.id ?? '';

  const productOf = (productId: string) => products.find((p) => p.id === productId);
  const unitFor = (productId: string) => productOf(productId)?.unit_type ?? 'ton';
  const contractsFor = (productId: string) => contracts.filter((c) => c.productId === productId);

  /*
   * F-4a fault 2: the dropdown used to default to "No booking", so the natural
   * flow recorded delivered tonnage attributed to nothing. Live proof was a
   * 24-ton semi of urea sitting unattributed beside a 24-ton spot buy showing
   * 24 t still to call — the same tons counted as both owed and delivered.
   *
   * One booking means there is no choice to make, so it is made.
   */
  const defaultContractFor = (productId: string) => {
    const list = contractsFor(productId);
    return list.length === 1 ? list[0].id : '';
  };

  const blankLine = (productId: string): DraftLine => ({
    key: newKey(),
    productId,
    contractId: defaultContractFor(productId),
    quantity: '',
    unitType: unitFor(productId),
    spot: null,
  });

  const [deliveredOn, setDeliveredOn] = useState(
    existing?.deliveredOn ?? new Date().toISOString().slice(0, 10)
  );
  const [loadType, setLoadType] = useState(existing?.loadType ?? '');
  const [ticketNumber, setTicketNumber] = useState(existing?.ticketNumber ?? '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [deliveryFee, setDeliveryFee] = useState(
    existing ? String(existing.deliveryFee) : ''
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    existing && existing.lines.length > 0
      ? existing.lines.map((l) => ({
          key: newKey(),
          productId: l.productId,
          contractId: l.contractId ?? '',
          quantity: String(l.quantity),
          unitType: l.unitType,
          spot: null,
        }))
      : [blankLine(firstProduct)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const applyPreset = (type: (typeof LOAD_TYPES)[number]) => {
    setLoadType(type.value);
    // Only prefill a single-line ticket; overwriting a transcribed multi-product
    // ticket because someone tapped "Semi" would be worse than no preset at all.
    if (type.tons !== null && lines.length === 1 && lines[0].quantity.trim() === '') {
      setLine(lines[0].key, { quantity: String(type.tons) });
    }
  };

  /** What this line draws, and whether it draws more than its booking has left. */
  const drawFor = (line: DraftLine) => {
    const product = productOf(line.productId);
    const qty = parseNumberField(line.quantity);
    if (!product || qty === null || qty <= 0) return null;
    const remaining =
      line.spot === null && line.contractId !== ''
        ? remainingByContract[line.contractId] ?? null
        : null;
    return planLineDraw(qty, line.unitType, product.unit_type, remaining, product.density_lb_per_gal);
  };

  /*
   * F-4a fault 3. The schema already handles a partial draw: a load line is per
   * product PER BOOKING, and nothing stops two lines for the same product on one
   * ticket. So a 24-ton semi against a booking with 20.35 t left becomes two
   * lines — which is also more truthful than one number, because those tons cost
   * different money and the blended price should say so.
   */
  const applySplit = (line: DraftLine, split: DrawSplit) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.key === line.key);
      if (i === -1) return prev;
      const kept: DraftLine = { ...prev[i], quantity: String(split.onContractInLineUnit) };
      const spilled: DraftLine = {
        key: newKey(),
        productId: line.productId,
        contractId: '',
        quantity: String(split.onSpotInLineUnit),
        unitType: line.unitType,
        spot: { label: 'Spot buy', price: '' },
      };
      return [...prev.slice(0, i), kept, spilled, ...prev.slice(i + 1)];
    });
  };

  const startSpot = (line: DraftLine) =>
    setLine(line.key, { contractId: '', spot: { label: 'Spot buy', price: '' } });

  const cancelSpot = (line: DraftLine) =>
    setLine(line.key, { spot: null, contractId: defaultContractFor(line.productId) });

  const handleSubmit = async () => {
    setError(null);

    const parsed: LoadLineInput[] = [];
    let createsPricedSpot = false;

    for (const line of lines) {
      const product = productOf(line.productId);
      if (!product) {
        setError('Every line needs a product.');
        return;
      }
      const qty = parseNumberField(line.quantity);
      if (qty === null || qty <= 0) {
        setError(`${product.product_name}: every line needs a quantity greater than zero.`);
        return;
      }

      let newContract: LoadLineInput['newContract'] = null;
      if (line.spot) {
        // A contract is denominated in its product's own unit, so the line
        // quantity is converted here. Refusing beats booking a wrong tonnage.
        const inProductUnit = convertProductUnits(
          line.unitType,
          product.unit_type,
          qty,
          product.density_lb_per_gal
        );
        if (!inProductUnit.ok) {
          setError(
            `${product.product_name}: a spot buy must be booked in ${product.unit_type}, but ` +
              `${describeConversionFailure(inProductUnit)}.`
          );
          return;
        }
        const price = line.spot.price.trim() === '' ? null : parseNumberField(line.spot.price);
        if (line.spot.price.trim() !== '' && (price === null || price <= 0)) {
          setError(
            `${product.product_name}: a spot buy price must be greater than zero, or left ` +
              'blank until it is settled.'
          );
          return;
        }
        if (price !== null) createsPricedSpot = true;
        newContract = {
          label: line.spot.label.trim() || 'Spot buy',
          pricePerUnit: price,
          contractedQuantity: inProductUnit.value,
        };
      }

      parsed.push({
        fertilizerProductId: line.productId,
        contractId: line.contractId === '' ? null : line.contractId,
        quantity: qty,
        unitType: line.unitType,
        computedQuantity: null,
        newContract,
      });
    }

    if (parsed.length === 0) {
      setError('A ticket needs at least one product line.');
      return;
    }
    if (!deliveredOn) {
      setError('A delivery date is required.');
      return;
    }
    const fee = deliveryFee.trim() === '' ? 0 : parseNumberField(deliveryFee);
    if (fee === null || fee < 0) {
      setError('Delivery fee must be zero or more.');
      return;
    }

    setSaving(true);
    const result = await saveLoad(
      {
        id: existing?.id,
        seasonId,
        deliveredOn,
        ticketNumber: ticketNumber.trim(),
        loadType,
        supplier: supplier.trim(),
        deliveryFee: fee,
        notes: notes.trim(),
        lines: parsed,
      },
      userId
    );
    setSaving(false);

    // The modal stays open on failure so the entry is not lost — signal at a
    // fertilizer plant is not reliable.
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved({ pricesChanged: createsPricedSpot });
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit load ticket' : 'Record a load'}
      subtitle="One line per product, the way the plant's ticket reads"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save ticket'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Load type</label>
          <div className="grid grid-cols-3 gap-2">
            {LOAD_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => applyPreset(t)}
                className={`py-3 px-2 rounded-lg border text-sm font-medium ${
                  loadType === t.value
                    ? 'bg-green-50 border-green-500 text-green-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label}
                {t.tons !== null && (
                  <span className="block text-xs font-normal text-gray-500">{t.tons} t</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivered on</label>
            <input
              type="date"
              value={deliveredOn}
              onChange={(e) => setDeliveredOn(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ticket number</label>
            <input
              type="text"
              inputMode="numeric"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">Products on this ticket</h4>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine(firstProduct)])}
              className="inline-flex items-center gap-1 py-2 px-3 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line) => {
              const product = productOf(line.productId);
              const productUnit = product?.unit_type ?? 'ton';
              const forProduct = contractsFor(line.productId);
              const draw = drawFor(line);

              return (
                <div key={line.key} className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) =>
                        setLine(line.key, {
                          productId: e.target.value,
                          unitType: unitFor(e.target.value),
                          contractId: line.spot ? '' : defaultContractFor(e.target.value),
                        })
                      }
                      className="grow min-w-0 px-3 py-3 border border-gray-300 rounded-lg bg-white"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.product_name}</option>
                      ))}
                    </select>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove line"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        className="p-3 text-gray-400 hover:text-red-600 rounded-lg shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="Quantity"
                      value={line.quantity}
                      onChange={(v) => setLine(line.key, { quantity: v })}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                      <select
                        value={line.unitType}
                        onChange={(e) => setLine(line.key, { unitType: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg bg-white"
                      >
                        {['ton', 'lbs', 'gallon', 'quart'].map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {draw && !draw.ok && (
                    <p className="text-sm text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>This line {draw.message}. It will not count toward the drawdown.</span>
                    </p>
                  )}

                  {line.spot ? (
                    /* F-4a fault 1: a spot buy and its load are the same event,
                       so it is entered here rather than sending the user off to
                       "Add booking" and back. */
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-blue-900">
                          New spot buy for these tons
                        </p>
                        <button
                          type="button"
                          onClick={() => cancelSpot(line)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 py-2 px-2 rounded-lg hover:bg-blue-100"
                        >
                          <X className="w-3.5 h-3.5" /> Use a booking instead
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
                          <input
                            type="text"
                            value={line.spot.label}
                            onChange={(e) =>
                              setLine(line.key, { spot: { ...line.spot!, label: e.target.value } })
                            }
                            placeholder="June spot"
                            className="w-full px-3 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <NumberField
                          label="Price"
                          value={line.spot.price}
                          onChange={(v) =>
                            setLine(line.key, { spot: { ...line.spot!, price: v } })
                          }
                          prefix="$"
                          suffix={`/ ${productUnit}`}
                        />
                      </div>
                      <p className="text-xs text-blue-900">
                        {draw && draw.ok
                          ? `Books ${num(draw.quantityInProductUnit)} ${productUnit}. `
                          : ''}
                        Saving this ticket creates the booking and the delivery together, and
                        rolls the price into this product's blended cost. Leave the price blank
                        if it is not settled.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Draws against
                      </label>
                      <select
                        value={line.contractId}
                        onChange={(e) => setLine(line.key, { contractId: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">No booking</option>
                        {forProduct.map((c) => {
                          const left = remainingByContract[c.id];
                          return (
                            <option key={c.id} value={c.id}>
                              {c.label || (c.kind === 'spot' ? 'Spot buy' : 'Booking')}
                              {c.pricePerUnit !== null ? ` — $${c.pricePerUnit}` : ''}
                              {left === undefined ? '' : ` · ${num(left)} ${productUnit} left`}
                            </option>
                          );
                        })}
                      </select>

                      {line.contractId === '' && (
                        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
                          <p className="text-xs text-amber-700">
                            {forProduct.length === 0
                              ? 'No booking exists for this product yet.'
                              : 'These tons will not be counted against any booking.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => startSpot(line)}
                            className="inline-flex items-center gap-1 py-2 px-3 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
                          >
                            <Plus className="w-4 h-4" /> Buy these on the spot
                          </button>
                        </div>
                      )}

                      {draw && draw.ok && draw.overDraws && (
                        <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <p className="text-sm text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                              Only {num(draw.remaining ?? 0)} {productUnit} left on this booking,
                              and this line is {num(draw.quantityInProductUnit)}.
                            </span>
                          </p>
                          {draw.split ? (
                            <button
                              type="button"
                              onClick={() => applySplit(line, draw.split!)}
                              className="mt-2 inline-flex items-center gap-1 py-2 px-3 text-sm font-medium text-amber-900 border border-amber-400 rounded-lg hover:bg-amber-100"
                            >
                              <Split className="w-4 h-4" />
                              Split — {num(draw.split.onContractInLineUnit)} on the booking,{' '}
                              {num(draw.split.onSpotInLineUnit)} on a spot buy
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startSpot(line)}
                              className="mt-2 inline-flex items-center gap-1 py-2 px-3 text-sm font-medium text-amber-900 border border-amber-400 rounded-lg hover:bg-amber-100"
                            >
                              <Plus className="w-4 h-4" /> Buy all of these on the spot
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <NumberField
            label="Delivery fee"
            value={deliveryFee}
            onChange={setDeliveryFee}
            prefix="$"
            help="Totalled for the season on its own. Not added to field costs."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ordered for Home 80, Creek 60"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
