export default function RequestState({ error, empty, retry }: { error?: string; empty?: string; retry?: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600" role={error ? 'alert' : undefined}>
    <p>{error || empty}</p>
    {error && retry && <button onClick={retry} className="mt-3 text-blue-600 underline">Try again</button>}
  </div>;
}
