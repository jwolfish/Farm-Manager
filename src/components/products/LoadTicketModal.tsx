import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import {
  saveLoad,
  type Contract,
  type FertilizerProduct,
  type Load,
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

interface DraftLine {
  key: string;
  productId: string;
  contractId: string;
  quantity: string;
  unitType: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  seasonId: string;
  products: FertilizerProduct[];
  contracts: Contract[];
  existing?: Load | null;
  /** Card the user tapped "Add load" on, so the first line is prefilled. */
  defaultProductId?: string;
}

let lineKey = 0;
const newKey = () => `line-${lineKey++}`;

export function LoadTicketModal({
  open, onClose, onSaved, seasonId, products, contracts, existing, defaultProductId,
}: Props) {
  const firstProduct = defaultProductId ?? products[0]?.id ?? '';
  const unitFor = (productId: string) =>
    products.find((p) => p.id === productId)?.unit_type ?? 'ton';

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
        }))
      : [{ key: newKey(), productId: firstProduct, contractId: '', quantity: '', unitType: unitFor(firstProduct) }]
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

  const handleSubmit = async () => {
    setError(null);

    const parsed: Array<{ productId: string; contractId: string | null; quantity: number; unitType: string }> = [];
    for (const line of lines) {
      if (!line.productId) {
        setError('Every line needs a product.');
        return;
      }
      const qty = parseNumberField(line.quantity);
      if (qty === null || qty <= 0) {
        setError('Every line needs a quantity greater than zero.');
        return;
      }
      parsed.push({
        productId: line.productId,
        contractId: line.contractId === '' ? null : line.contractId,
        quantity: qty,
        unitType: line.unitType,
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
    const result = await saveLoad({
      id: existing?.id,
      seasonId,
      deliveredOn,
      ticketNumber: ticketNumber.trim(),
      loadType,
      supplier: supplier.trim(),
      deliveryFee: fee,
      notes: notes.trim(),
      lines: parsed.map((p) => ({
        fertilizerProductId: p.productId,
        contractId: p.contractId,
        quantity: p.quantity,
        unitType: p.unitType,
        computedQuantity: null,
      })),
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved();
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
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { key: newKey(), productId: firstProduct, contractId: '', quantity: '', unitType: unitFor(firstProduct) },
                ])
              }
              className="inline-flex items-center gap-1 py-2 px-3 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line) => {
              const forProduct = contracts.filter((c) => c.productId === line.productId);
              return (
                <div key={line.key} className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) =>
                        setLine(line.key, {
                          productId: e.target.value,
                          unitType: unitFor(e.target.value),
                          contractId: '',
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
                      {forProduct.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label || (c.kind === 'spot' ? 'Spot buy' : 'Booking')}
                          {c.pricePerUnit !== null ? ` — $${c.pricePerUnit}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
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
