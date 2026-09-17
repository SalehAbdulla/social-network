/**
 * Inline placeholder for non-error states, e.g. a request that succeeded with
 * no data. Request failures are reported with toasts instead — see ../lib/notify.tsx.
 */
export default function RequestState({ empty }: { empty?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
    <p>{empty}</p>
  </div>;
}
