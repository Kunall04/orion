import React, { type ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'success' | 'quiet';
  size?: 'xs' | 'sm' | 'md';
}

const VARIANTS: Record<string, string> = {
  primary:
    'bg-ink text-canvas hover:opacity-90 dark:bg-ink dark:text-canvas shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]',
  secondary: 'bg-surface text-ink shadow-btn hover:bg-inset aria-expanded:bg-hover',
  ghost: 'bg-hover-2 text-ink hover:bg-line-strong',
  accent:
    'bg-accent text-white hover:bg-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]',
  success:
    'bg-green text-white hover:brightness-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]',
  quiet: 'text-ink hover:bg-hover',
};

const SIZES: Record<string, string> = {
  xs: 'h-7 rounded-full px-2.5 text-[12px] font-normal gap-1',
  sm: 'h-[27px] rounded-full px-3 text-[13px] leading-none gap-1.5',
  md: 'h-8 rounded-control px-3 text-[13px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'sm', className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-medium select-none
          transition-[transform,background-color,opacity] duration-150 ease-out
          active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none
          ${VARIANTS[variant] ?? VARIANTS.secondary}
          ${SIZES[size] ?? SIZES.sm}
          ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
