/**
 * Shimmer placeholders for the paged lists.
 *
 * They mirror the geometry of the real cards so the first paint of a list has
 * the same rhythm as the loaded state instead of collapsing to a spinner and
 * then jumping.
 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function PostSkeleton() {
  return (
    <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
        <div className="space-y-2">
          <Bar className="h-3.5 w-32" />
          <Bar className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-2">
        <Bar className="h-4 w-2/3" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-5/6" />
      </div>
      <Bar className="h-52 w-full rounded-xl" />
      <div className="flex items-center gap-4 border-t border-border pt-3">
        <Bar className="h-5 w-16" />
        <Bar className="h-5 w-24" />
        <Bar className="ml-auto h-5 w-5" />
      </div>
    </article>
  );
}

export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <PostSkeleton key={index} />)}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="size-11 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
            <div className="space-y-2">
              <Bar className="h-3.5 w-28" />
              <Bar className="h-3 w-20" />
            </div>
          </div>
          <Bar className="h-3 w-full" />
          <div className="flex gap-2">
            <Bar className="h-9 w-24 rounded-xl" />
            <Bar className="h-9 w-24 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <Bar className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="h-3.5 w-40" />
            <Bar className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
