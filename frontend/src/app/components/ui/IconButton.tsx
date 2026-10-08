'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

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
