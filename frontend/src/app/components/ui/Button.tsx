'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The app's one button.
 *
 * Every conversation surface draws its actions from here, so a primary is the same blue, a
 * ghost the same weight and a destructive row the same red wherever it appears. The geometry —
 * the 32px height, the 8px radius, the 14px/600 label — is the `--btn-*` tokens; nothing in a
 * caller sets a height or a colour of its own. `loading` disables the button and swaps the
 * leading slot for a spinner, which is also what stops a double submit.
 */
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
