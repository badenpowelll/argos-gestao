import {cloneElement, useId, useState} from 'react';
import type {ReactElement} from 'react';

export interface TooltipProps {
  content: string;
  /** Um único elemento focável (botão, link, input). */
  children: ReactElement<{'aria-describedby'?: string}>;
}

/** Aparece em hover e foco; Escape fecha (WCAG 1.4.13). Conteúdo só textual. */
export function Tooltip({content, children}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      className="ads-tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {cloneElement(children, {'aria-describedby': open ? id : children.props['aria-describedby']})}
      {open && (
        <span role="tooltip" id={id} className="ads-tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
