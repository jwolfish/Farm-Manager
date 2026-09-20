import { Check, CreditCard as Edit2, DollarSign, Truck } from 'lucide-react';
import { coverageView } from '../../lib/shoppingListMath';
import type { ShoppingLine } from './ShoppingListsTab';

/*
 * One shopping-list row, split out of ShoppingListsTab as pure presentation.
 *
 * The split is the same one F-6 made between PlanCalculator and
 * PlanCalculatorModal, and for the same reason: the tab imports the Supabase
 * client at module load, which throws on a machine with no credentials, so
 * nothing inside it could ever be rendered in a harness. Every fertilizer
 * section before F-4b shipped with "not opened in a browser" against it, and
 * each of the three rounds that did open one found a real defect that reading
 * had not. This file has no Supabase import and no data access, so a harness can
 * mount it with fixtures.
 *
 * It holds no state either — editing state lives on the tab, because the tab is
 * what saves it.
 */

export interface EditValues {
  adjusted_quantity: string;
  supplier: string;
  quoted_price_per_unit: string;
}

interface Props {
  line: ShoppingLine;
  /** "On Hand" or "Booked" — the word the coverage column is headed with. */
  coverageLabel: string;
  isEditing: boolean;
  editValues: EditValues;
  readOnly: boolean;
  onEditValuesChange: (values: EditValues) => void;
  onSave: (lineId: string) => void;
  onCancel: () => void;
  onStartEdit: (line: ShoppingLine) => void;
  onBook: (line: ShoppingLine) => void;
  onPurchase: (line: ShoppingLine) => void;
  statusStyles: Record<string, string>;
}

const qty = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * MOB-4. Every action in this row was a bare text or icon button with NO padding.
 * Measured at 375 px with getBoundingClientRect, not guessed: Save and Cancel came
 * out at 16 px, "Edit quote" and "Book this" at 32, and the two icon-only ones at
 * 14 — against the >= 44 px rule this project keeps re-learning. Making the three
 * input boxes tappable and leaving Save at 16 would have been the worse defect of
 * the two, since Save is the control the edit exists for.
 *
 * Stated once rather than six times so the next button added here inherits it.
 * Mobile-first: the phone gets the target, `sm:` returns the desktop table to the
 * compact row it has today.
 */
const TOUCH_ACTION =
  'inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2 ' +
  'sm:min-h-0 sm:min-w-0 sm:px-0';

export function ShoppingListLineRow({
  line,
  coverageLabel,
  isEditing,
  editValues,
  readOnly,
  onEditValuesChange,
  onSave,
  onCancel,
  onStartEdit,
  onBook,
  onPurchase,
  statusStyles,
}: Props) {
  const cover = coverageView(
    line.plan_quantity,
    line.on_hand_at_generation,
    line.contracted_at_generation
  );

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{line.product_name}</div>
        {/*
          On a phone the coverage column is folded in here instead, so that Plan
          Need and To Buy — the two the eye actually compares — both stay on
          screen. Checked at 375 px: with nine columns and a horizontal scroll,
          To Buy was the one clipped, which is precisely the wrong one to lose.
        */}
        {cover.covered > 0 && (
          <div className="sm:hidden text-xs text-gray-500 mt-0.5">
            {coverageLabel} {qty(cover.covered)} {line.unit_type}
          </div>
        )}
      </td>

      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
        {qty(line.plan_quantity)} {line.unit_type}
      </td>

      <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-600 whitespace-nowrap">
        {/* An em dash rather than 0, so the eye finds the rows that have some. */}
        {cover.covered > 0 ? (
          `${qty(cover.covered)} ${line.unit_type}`
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="font-medium text-gray-900">
          {qty(line.needed_quantity)} {line.unit_type}
        </span>
        {/*
          The net clamps at zero, so "To buy 0" on its own would hide a real
          over-commitment — 40 t booked against a 33 t plan reads identically to
          33 t booked against 33. This is what makes the difference visible.
        */}
        {cover.overBy > 0 && (
          <div className="text-xs text-red-600 mt-0.5">
            {qty(cover.overBy)} {line.unit_type} over
          </div>
        )}
      </td>

      {/*
        MOB-4, and it applies to all three boxes in this edit row.

        NOT <NumberField> — that renders its own <label> above the box, and a table
        cell has nowhere to put one. What IS taken from it is the part that matters in
        a truck: text + inputMode="decimal" raises a keypad rather than a full
        keyboard, and a text box cannot change value on an accidental scroll the way
        type="number" does.

        `py-3 sm:py-1`, mobile-first: the phone gets a 44 px target and the desktop
        table keeps its density. Same scoping trick MOB-2 used on the Products tab
        strip, where an unscoped version nearly shipped a desktop regression.
      */}
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={editValues.adjusted_quantity}
            onChange={(e) => onEditValuesChange({ ...editValues, adjusted_quantity: e.target.value })}
            className="w-24 px-2 py-3 sm:py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        ) : (
          <span className="font-medium text-gray-900">
            {qty(line.adjusted_quantity ?? line.needed_quantity)}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="text"
            value={editValues.supplier}
            onChange={(e) => onEditValuesChange({ ...editValues, supplier: e.target.value })}
            placeholder="Supplier name"
            className="w-32 px-2 py-3 sm:py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        ) : (
          <span className="text-gray-700">{line.supplier || <span className="text-gray-300">--</span>}</span>
        )}
      </td>

      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={editValues.quoted_price_per_unit}
            onChange={(e) => onEditValuesChange({ ...editValues, quoted_price_per_unit: e.target.value })}
            placeholder="0.00"
            className="w-24 px-2 py-3 sm:py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        ) : line.purchased_price_per_unit != null ? (
          <span className="font-medium text-green-700">
            ${line.purchased_price_per_unit.toFixed(2)}
          </span>
        ) : line.quoted_price_per_unit != null ? (
          <span className="text-gray-900">${line.quoted_price_per_unit.toFixed(2)}</span>
        ) : (
          <span className="text-gray-300">--</span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[line.status]}`}>
          {line.status}
        </span>
        {line.purchased_at && (
          <div className="text-[10px] text-gray-400 mt-0.5">
            {new Date(line.purchased_at).toLocaleDateString()}
          </div>
        )}
      </td>

      {!readOnly && (
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => onSave(line.id)}
                  className={`${TOUCH_ACTION} text-green-600 hover:text-green-700 text-xs font-medium`}
                >
                  Save
                </button>
                <button
                  onClick={onCancel}
                  className={`${TOUCH_ACTION} text-gray-500 hover:text-gray-700 text-xs font-medium`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onStartEdit(line)}
                  className={`${TOUCH_ACTION} text-blue-600 hover:text-blue-700 text-xs font-medium`}
                  title="Edit quantity, supplier and quoted price"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit quote
                </button>
                {/* F-5. Fertilizer is priced by its bookings, so these lines hand
                    off rather than being "purchased" here. Otherwise two features
                    write fertilizer_products.price_per_unit and each fires its
                    own cascade, last write wins. Chemical and seed are
                    untouched. */}
                {line.product_category === 'fertilizer' ? (
                  <button
                    onClick={() => onBook(line)}
                    className={`${TOUCH_ACTION} text-green-700 hover:text-green-800 text-xs font-medium`}
                    title="Create a booking for this product"
                  >
                    <Truck className="w-3.5 h-3.5" /> Book this
                  </button>
                ) : line.status !== 'purchased' ? (
                  <button
                    onClick={() => onPurchase(line)}
                    className={`${TOUCH_ACTION} text-green-600 hover:text-green-700`}
                    title="Mark purchased"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => onPurchase(line)}
                    className={`${TOUCH_ACTION} text-gray-500 hover:text-gray-700`}
                    title="Edit purchase"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
