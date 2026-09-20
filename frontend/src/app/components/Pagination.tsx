'use client';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalPages, hasNext, loading, onChange, label = 'Pagination' }: {
  page: number; totalPages?: number; hasNext: boolean; loading: boolean; onChange: (page: number) => void; label?: string;
}) {
  const lastChange = useRef(0);
  function change(next: number) {
    if (loading || Date.now() - lastChange.current < 400 || next < 1) return;
    lastChange.current = Date.now(); onChange(next);
  }
  return <nav aria-label={label} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
    <button type="button" disabled={loading || page <= 1} onClick={() => change(page - 1)} className="flex items-center gap-1 rounded-lg px-2 py-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={16} />Previous</button>
    <span role="status" className="text-xs text-slate-500">{loading ? 'Loading…' : `Page ${page}${totalPages ? ` of ${totalPages}` : ''}`}</span>
    <button type="button" disabled={loading || !hasNext} onClick={() => change(page + 1)} className="flex items-center gap-1 rounded-lg px-2 py-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">Next<ChevronRight size={16} /></button>
  </nav>;
}
