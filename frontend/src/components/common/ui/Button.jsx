// frontend/src/components/common/ui/Button.jsx
import React from 'react';

const VARIANTS = {
  primary:   'bg-accent text-accent-fg hover:bg-accent-hover shadow-card',
  secondary: 'bg-surface-2 text-content border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost:     'bg-transparent text-muted hover:text-content hover:bg-surface-3',
  danger:    'bg-danger/90 text-white hover:bg-danger',
  subtle:    'bg-surface-3 text-content hover:bg-line',
};

const SIZES = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-4 py-2.5 text-sm gap-2',
};

const Button = React.forwardRef(({
  variant = 'primary', size = 'md', className = '', icon: Icon, iconRight: IconRight,
  loading = false, disabled = false, children, ...props
}, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap
      transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed
      ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
    {...props}
  >
    {loading
      ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
      : Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}
    {children}
    {IconRight && !loading && <IconRight size={size === 'sm' ? 14 : 16} aria-hidden />}
  </button>
));

Button.displayName = 'Button';
export default Button;
