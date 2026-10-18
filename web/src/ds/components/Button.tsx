import {forwardRef} from 'react';
import type {ButtonHTMLAttributes} from 'react';
import {cx} from './cx';
import {Spinner} from './Status';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Aparência. `primary` = laranja de ação (texto navy, contraste 6,1:1). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner, define `aria-busy` e bloqueia cliques. */
  loading?: boolean;
}

/** `type="button"` por padrão para não submeter formulários sem querer. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {variant = 'primary', size = 'md', loading = false, type = 'button', className, disabled, children, onClick, ...rest},
  ref
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cx('ads-btn', `ads-btn--${variant}`, size === 'sm' && 'ads-btn--sm', className)}
    >
      {loading && <Spinner label="Carregando" />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  /** Nome acessível obrigatório (o botão não tem texto visível). */
  label: string;
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {label, icon, className, variant = 'ghost', ...rest},
  ref
) {
  return (
    <Button {...rest} ref={ref} variant={variant} aria-label={label} className={cx('ads-icon-btn', className)}>
      <span aria-hidden="true">{icon}</span>
    </Button>
  );
});
