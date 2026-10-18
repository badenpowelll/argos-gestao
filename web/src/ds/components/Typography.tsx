import type {AnchorHTMLAttributes, HTMLAttributes} from 'react';
import {cx} from './cx';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Nível semântico (h1–h6). */
  level?: HeadingLevel;
  /** Tamanho visual, independente do nível semântico. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Título de destaque da marca: CAIXA ALTA, Bold, entrelinha 100%. */
  headline?: boolean;
}

export function Heading({level = 2, size = 'md', headline = false, className, ...rest}: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      {...rest}
      className={cx('ads-heading', `ads-heading--${size}`, headline && 'ads-heading--headline', className)}
    />
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'p' | 'span' | 'div';
  muted?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function Text({as: Tag = 'p', muted = false, size = 'md', className, ...rest}: TextProps) {
  return (
    <Tag
      {...rest}
      className={cx('ads-text', muted && 'ads-text--muted', size !== 'md' && `ads-text--${size}`, className)}
    />
  );
}

/** Link com tratamento seguro: `target="_blank"` sempre recebe `rel="noopener noreferrer"`. */
export function Link({target, rel, className, ...rest}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const safeRel =
    target === '_blank'
      ? Array.from(new Set(['noopener', 'noreferrer', ...(rel ? rel.split(/\s+/) : [])])).join(' ')
      : rel;
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  return <a {...rest} target={target} rel={safeRel} className={cx('ads-link', className)} />;
}

export function Divider({orientation = 'horizontal'}: {orientation?: 'horizontal' | 'vertical'}) {
  return (
    <hr
      className={cx('ads-divider', orientation === 'vertical' && 'ads-divider--vertical')}
      aria-orientation={orientation}
    />
  );
}
