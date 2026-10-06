'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The app's one icon button: a 24px icon in a 32px round hit area.
 *
 * `label` is required rather than optional, because an icon button with no name is invisible
 * to a screen reader and the compiler should be the thing that says so. The focus ring comes
 * from the global `focus-visible` rule, so it is the same ring a text button wears.
 */
export default function IconButton({ label, children, className = '', ...rest }: {
  label: string;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label'>) {
  return <button
    type="button"
    aria-label={label}
    {...rest}
    className={`ui-icon-btn ${className}`}
  >
    {children}
  </button>;
}
