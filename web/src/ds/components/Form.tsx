import {forwardRef, useId} from 'react';
import type {InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes} from 'react';
import {cx} from './cx';
import {IconButton} from './Button';

export interface ControlA11yProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}
export interface FieldMessages {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/** Liga rótulo, dica e erro ao controle. O erro tem prioridade sobre a dica. */
export function FormField({
  label,
  hint,
  error,
  required,
  children
}: FieldMessages & {children: (a11y: ControlA11yProps) => React.ReactNode}) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error || hint;
  return (
    <div className="ads-field">
      <label htmlFor={id} className="ads-label">
        {label}
        {required && (
          <span className="ads-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined
      })}
      {message && (
        <span id={messageId} className={cx('ads-text ads-text--xs', error ? 'ads-text--error' : 'ads-text--muted')}>
          {error && <span className="ads-sr-only">Erro:</span>}
          {error && ' '}
          {message}
        </span>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldMessages {}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {label, hint, error, required, className, ...rest},
  ref
) {
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      {(a11y) => <input {...rest} {...a11y} ref={ref} required={required} className={cx('ads-input', className)} />}
    </FormField>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldMessages {}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {label, hint, error, required, className, ...rest},
  ref
) {
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      {(a11y) => <textarea {...rest} {...a11y} ref={ref} required={required} className={cx('ads-input', className)} />}
    </FormField>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldMessages {
  options: SelectOption[];
  /** Texto da opção vazia inicial (ex.: "Selecione"). */
  placeholder?: string;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {label, hint, error, required, options, placeholder, className, ...rest},
  ref
) {
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      {(a11y) => (
        <select {...rest} {...a11y} ref={ref} required={required} className={cx('ads-input', className)}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {label, className, ...rest},
  ref
) {
  return (
    <label className={cx('ads-check', className)}>
      <input {...rest} ref={ref} type="checkbox" />
      <span>{label}</span>
    </label>
  );
});

export interface RadioGroupProps {
  legend: string;
  name: string;
  options: {value: string; label: string; disabled?: boolean}[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}
export function RadioGroup({legend, name, options, value, onChange, error, hint}: RadioGroupProps) {
  const id = useId();
  const message = error || hint;
  return (
    <fieldset
      className="ads-fieldset"
      aria-describedby={message ? `${id}-msg` : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="ads-label">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="ads-check">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
      {message && (
        <span id={`${id}-msg`} className={cx('ads-text ads-text--xs', error ? 'ads-text--error' : 'ads-text--muted')}>
          {message}
        </span>
      )}
    </fieldset>
  );
}

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}
/** Interruptor (role="switch"). Space/Enter alternam. */
export function Switch({label, checked, onChange, disabled}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="ads-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="ads-switch__track" aria-hidden="true">
        <span className="ads-switch__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
}
export function SearchInput({label, value, onChange, onSearch, className, ...rest}: SearchInputProps) {
  return (
    <FormField label={label}>
      {(a11y) => (
        <div role="search" className="ads-search">
          <input
            {...rest}
            {...a11y}
            type="search"
            value={value}
            className={cx('ads-input', className)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch?.(value);
              if (e.key === 'Escape' && value) onChange('');
            }}
          />
          {value && (
            <IconButton
              className="ads-search__clear"
              size="sm"
              label="Limpar busca"
              icon="✕"
              onClick={() => onChange('')}
            />
          )}
        </div>
      )}
    </FormField>
  );
}
