import { useEffect, useRef, useState } from 'react';
import { Search, Plus, FlaskConical } from 'lucide-react';
import { searchFarmChemicals } from '../lib/workOrderCrud';

interface PickerResult {
  masterProductId: string | null;
  chemicalName: string;
  unitType: string;
}

interface Props {
  farmId: string;
  onSelect: (result: PickerResult) => void;
  onClose: () => void;
}

export function ChemicalProductPicker({ farmId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; unitType: string }>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const data = await searchFarmChemicals(farmId, query);
      setResults(data);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [farmId, query]);

  const trimmedQuery = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div ref={containerRef} className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search existing chemicals or type a new name..."
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="px-4 py-3 text-xs text-gray-400 text-center">Searching...</div>
        )}

        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect({ masterProductId: r.id, chemicalName: r.name, unitType: r.unitType })}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
          >
            <FlaskConical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-800 flex-1">{r.name}</span>
            <span className="text-xs text-gray-400">{r.unitType}</span>
          </button>
        ))}

        {trimmedQuery && !exactMatch && (
          <button
            type="button"
            onClick={() => onSelect({ masterProductId: null, chemicalName: trimmedQuery, unitType: 'fl oz' })}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-green-50 transition-colors border-t border-gray-100"
          >
            <Plus className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 font-medium">Add "{trimmedQuery}" as new chemical</span>
          </button>
        )}

        {!trimmedQuery && results.length === 0 && !loading && (
          <div className="px-4 py-3 text-xs text-gray-400 text-center">No chemicals in the product catalog yet</div>
        )}
      </div>
    </div>
  );
}
