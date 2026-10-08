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

export function GroupRowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grp-skel-row">
          <span className="grp-skeleton grp-skel-avatar" />
          <span className="flex-1 space-y-2">
            <span className="grp-skeleton grp-skel-line block w-40" />
            <span className="grp-skeleton grp-skel-line block w-24" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function GroupPostsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 py-3">
          <div className="flex items-center gap-3">
            <span className="grp-skeleton grp-skel-avatar" />
            <span className="flex-1 space-y-2">
              <span className="grp-skeleton grp-skel-line block w-32" />
              <span className="grp-skeleton grp-skel-line block w-20" />
            </span>
          </div>
          <span className="grp-skeleton block h-16 w-full" />
          <span className="grp-skeleton block h-40 w-full" />
        </div>
      ))}
    </div>
  );
}

export function GroupEventsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grp-skel-block">
          <div className="flex gap-4">
            <span className="grp-skeleton size-14 shrink-0" />
            <span className="flex-1 space-y-2">
              <span className="grp-skeleton grp-skel-line block w-48" />
              <span className="grp-skeleton grp-skel-line block w-32" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupMediaSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grp-media-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="grp-skeleton block w-full" style={{ aspectRatio: 'var(--grp-media-ratio)' }} />
      ))}
    </div>
  );
}

