/**
 * A numeric text input that raises the right keyboard on a phone.
 *
 * The app has 43 `type="number"` inputs and only 6 `inputMode` attributes. For
 * entering tonnage in a truck that is the difference between a numeric keypad
 * and a full keyboard, so every new field goes through here.
 *
 * `type="text"` with `inputMode="decimal"` rather than `type="number"` on
 * purpose: number inputs silently discard what the browser considers invalid,
 * change value on an accidental scroll, and vary between browsers on what they
 * will even let you type. Text plus a parse we control is predictable.
 */

import { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown inside the field on the right — a unit, usually. */
  suffix?: string;
  /** Shown inside the field on the left — '$', usually. */
  prefix?: string;
  placeholder?: string;
  help?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** Whole numbers only — a ticket number, say. */
  integer?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  placeholder,
  help,
  error,
  required,
  disabled,
  integer,
}: Props) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>

      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          /* py-3 is a 44px tap target. The app's usual py-2 is about 36, which
             is a real miss with gloves on. */
          className={`w-full py-3 border rounded-lg focus:ring-2 focus:border-transparent
                      disabled:bg-gray-50 disabled:text-gray-500
                      ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-16' : 'pr-3'}
                      ${error
                        ? 'border-red-400 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-green-500'}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-gray-500">{help}</p>
      ) : null}
    </div>
  );
}
