'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'text';

const VARIANT: Record<Variant, string> = {
  primary: 'ui-btn-primary',
  secondary: 'ui-btn-secondary',
  ghost: 'ui-btn-ghost',
  danger: 'ui-btn-danger',
  text: 'ui-btn-text',
};

const Button = forwardRef<HTMLButtonElement, {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>>(function Button(
  { variant = 'primary', loading = false, disabled = false, children, className = '', ...rest },
  ref,
) {
  return <button
    ref={ref}
    type="button"
    {...rest}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`ui-btn ${VARIANT[variant]} ${className}`}
  >
    {loading && <Loader2 aria-hidden="true" className="ui-btn-spinner" />}
    {children}
  </button>;
});

export default Button;
