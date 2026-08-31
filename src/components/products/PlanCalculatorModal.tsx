import { useEffect, useState } from 'react';
import { loadPlanInputs } from '../../lib/fertilizerContracts';
import type { PlanField, PlanProgram } from '../../lib/fertilizerPlanMath';
import { PlanCalculator, type PlanResult } from './PlanCalculator';

export type { PlanResult };

/**
 * The plan calculator, wired to the database — F-6.
 *
 * Nothing but loading lives here. The screen itself is `PlanCalculator`, in its
 * own file, importing nothing that reaches Supabase so it can be rendered with
 * fixtures. That separation is not decoration: the Supabase client throws at
 * module load when no credentials are present, so anything that imports it
 * cannot be previewed on a machine that has never had them — which is this one.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  seasonId: string;
  /** Restrict the answer to one product; the booking form wants a single number. */
  productId?: string;
  onApply: (result: PlanResult) => void;
}

function usePlanInputs(seasonId: string) {
  const [fields, setFields] = useState<PlanField[]>([]);
  const [programs, setPrograms] = useState<PlanProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPlanInputs(seasonId)
      .then((data) => {
        if (cancelled) return;
        setFields(data.fields);
        setPrograms(data.programs);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed read must say so rather than render an empty, reassuring form
        // that reads as "this season has no fields".
        setError(err instanceof Error ? err.message : 'Could not load fields and programs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [seasonId]);

  return { fields, programs, loading, error };
}

export function PlanCalculatorModal({ open, onClose, seasonId, productId, onApply }: Props) {
  const { fields, programs, loading, error } = usePlanInputs(seasonId);
  return (
    <PlanCalculator
      open={open}
      onClose={onClose}
      fields={fields}
      programs={programs}
      loading={loading}
      error={error}
      productId={productId}
      onApply={onApply}
    />
  );
}
