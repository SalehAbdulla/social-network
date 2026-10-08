'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ compact = false, label = false, className = '' }: {
  compact?: boolean;
  label?: boolean;
  className?: string;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const button = compact ? (
    <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title="Toggle dark mode" onClick={toggleTheme}
      className="glass-track flex size-11 items-center justify-center rounded-xl transition hover:scale-105 active:scale-95">
      <IconStack size={18} />
    </button>
  ) : (
    <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title="Toggle dark mode" onClick={toggleTheme}
      className="glass-track relative flex h-9 w-16 shrink-0 items-center rounded-lg px-1 transition">
      <span data-testid="theme-knob" className="relative flex size-7 items-center justify-center rounded-full border border-white/80 bg-linear-to-b from-white/95 to-white/65 shadow-[0_2px_6px_-1px_rgba(15,48,87,0.35)] transition-transform duration-300 ease-out translate-x-0 dark:translate-x-7 dark:border-white/20 dark:from-white/25 dark:to-white/5 dark:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.7)]">
        <IconStack size={16} />
      </span>
    </button>
  );
  return <div className={`flex items-center gap-3 ${className}`}>
    {button}
    {label && !compact && <span aria-hidden="true" className="text-sm font-medium text-muted">
      <span className="dark:hidden">Light</span>
      <span className="hidden dark:inline">Dark</span>
    </span>}
  </div>;
}

function IconStack({ size }: { size: number }) {
  return <span aria-hidden="true" className="relative block size-5">
    <Sun size={size} className="absolute inset-0 m-auto rotate-0 scale-100 text-amber-500 opacity-100 transition duration-300 dark:-rotate-90 dark:scale-50 dark:opacity-0" />
    <Moon size={size} className="absolute inset-0 m-auto rotate-90 scale-50 text-teal-300 opacity-0 transition duration-300 dark:rotate-0 dark:scale-100 dark:opacity-100" />
  </span>;
}
