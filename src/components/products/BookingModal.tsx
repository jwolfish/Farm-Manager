import { useState } from 'react';
import { ResponsiveModal } from '../ResponsiveModal';
import { NumberField } from '../NumberField';
import { parseNumberField } from '../../lib/mathUtils';
import { saveContract, type Contract, type FertilizerProduct } from '../../lib/fertilizerContracts';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  seasonId: string;
  userId: string;
  product: FertilizerProduct;
  /** Present when editing. */
  existing?: Contract | null;
  /** Prefilled from the plan calculator or the shopping list, when handed one. */
  suggestedQuantity?: number | null;
}

export function BookingModal({
  open, onClose, onSaved, seasonId, userId, product, existing, suggestedQuantity,
}: Props) {
  const [kind, setKind] = useState<'contract' | 'spot'>(existing?.kind ?? 'contract');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [quantity, setQuantity] = useState(
    existing ? String(existing.contractedQuantity) : suggestedQuantity ? String(Math.round(suggestedQuantity * 100) / 100) : ''
  );
  const [price, setPrice] = useState(existing?.pricePerUnit != null ? String(existing.pricePerUnit) : '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [bookedOn, setBookedOn] = useState(existing?.bookedOn ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qtyError, setQtyError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setQtyError(null);

    const qty = parseNumberField(quantity);
    if (qty === null || qty <= 0) {
      setQtyError('Enter a quantity greater than zero.');
      return;
    }
    const parsedPrice = price.trim() === '' ? null : parseNumberField(price);
    if (price.trim() !== '' && (parsedPrice === null || parsedPrice <= 0)) {
      setError('Price must be a number greater than zero, or left blank until it is settled.');
      return;
    }

    setSaving(true);
    const result = await saveContract(
      {
        id: existing?.id,
        seasonId,
        fertilizerProductId: product.id,
        kind,
        label: label.trim(),
        contractedQuantity: qty,
        pricePerUnit: parsedPrice,
        supplier: supplier.trim(),
        bookedOn: bookedOn.trim(),
        notes: notes.trim(),
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
    onSaved();
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit booking' : 'Add booking'}
      subtitle={`${product.product_name} — priced per ${product.unit_type}`}
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
            {saving ? 'Saving…' : 'Save booking'}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(['contract', 'spot'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`py-3 px-4 rounded-lg border font-medium ${
                  kind === k
                    ? 'bg-green-50 border-green-500 text-green-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {k === 'contract' ? 'Booked' : 'Spot buy'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            A spot buy is just a booking you filled the same day — it blends into the average
            the same way.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fall booking"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <NumberField
          label="Quantity"
          value={quantity}
          onChange={setQuantity}
          suffix={product.unit_type}
          error={qtyError}
          required
          help={`Bookings are always in ${product.unit_type}, the unit this product is priced in.`}
        />

        <NumberField
          label="Price"
          value={price}
          onChange={setPrice}
          prefix="$"
          suffix={`/ ${product.unit_type}`}
          help="Leave blank if the price is not settled. It will count toward tonnage but stay out of the blended cost."
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Fertilizer plant"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Booked on</label>
          <input
            type="date"
            value={bookedOn}
            onChange={(e) => setBookedOn(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Any date. Fall fertilizer for next year's crop belongs to that crop's season with
            its real date.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <p className="text-xs text-gray-500">
          Saving recalculates this product's blended cost and updates every field cost that
          uses it.
        </p>
      </div>
    </ResponsiveModal>
  );
}
