import {useId, useState} from 'react';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}
export interface AccordionProps {
  items: AccordionItem[];
  /** Permite vários itens abertos. */
  multiple?: boolean;
  defaultOpen?: string[];
  /** Nível semântico dos títulos (padrão h3). */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

export function Accordion({items, multiple = false, defaultOpen = [], headingLevel = 3}: AccordionProps) {
  const prefix = useId();
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const Heading = `h${headingLevel}` as const;
  const toggle = (id: string) =>
    setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : multiple ? [...cur, id] : [id]));
  return (
    <div className="ads-accordion">
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id} className="ads-accordion__item">
            <Heading className="ads-accordion__heading">
              <button
                type="button"
                id={`${prefix}-${item.id}-t`}
                className="ads-accordion__trigger"
                aria-expanded={isOpen}
                aria-controls={`${prefix}-${item.id}-p`}
                onClick={() => toggle(item.id)}
              >
                <span>{item.title}</span>
                <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
            </Heading>
            <div
              id={`${prefix}-${item.id}-p`}
              role="region"
              aria-labelledby={`${prefix}-${item.id}-t`}
              className="ads-accordion__panel"
              hidden={!isOpen}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
