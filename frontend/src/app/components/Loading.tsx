import { Loader2 } from 'lucide-react';

export default function Loading({ height = 100, label = 'Loading' }: { height?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: height }} className="flex w-full items-center justify-center">
      <Loader2 size={28} className="animate-spin text-teal-700" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
