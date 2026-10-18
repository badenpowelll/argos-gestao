import type {HTMLAttributes} from 'react';
import {cx} from './cx';
import {Heading} from './Typography';
import type {HeadingLevel} from './Typography';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: string;
  /** Nível do título do cartão (padrão h3). */
  headingLevel?: HeadingLevel;
}
export function Card({title, headingLevel = 3, className, children, ...rest}: CardProps) {
  return (
    <section {...rest} className={cx('ads-card', className)}>
      {title && (
        <Heading level={headingLevel} size="sm" className="ads-card__title">
          {title}
        </Heading>
      )}
      {children}
    </section>
  );
}

type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 8;
export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  direction?: 'column' | 'row';
}
export function Stack({gap = 4, direction = 'column', className, style, ...rest}: StackProps) {
  return (
    <div
      {...rest}
      className={cx('ads-stack', direction === 'row' && 'ads-stack--row', className)}
      style={{['--ads-gap' as string]: `var(--ads-space-${gap})`, ...style}}
    />
  );
}

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  /** Largura mínima de cada coluna; o grid se adapta sem breakpoints. */
  minColumnWidth?: number;
}
export function Grid({gap = 4, minColumnWidth = 220, className, style, ...rest}: GridProps) {
  return (
    <div
      {...rest}
      className={cx('ads-grid', className)}
      style={{
        ['--ads-gap' as string]: `var(--ads-space-${gap})`,
        ['--ads-grid-min' as string]: `${minColumnWidth}px`,
        ...style
      }}
    />
  );
}
