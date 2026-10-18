/** Opções de pagamento (funções puras; centavos). */
export type PaymentOptionConfig =
  | {id: string; type: 'a_vista'; label?: string; include_first_monthly?: boolean}
  | {id: string; type: 'entrada_mensalidades'; label?: string; include_first_monthly?: boolean; months?: number}
  | {id: string; type: 'cartao'; label?: string; base: 'inicial' | 'primeiro_ano'; installments: number; fee_pct: number; fee_passed: boolean; include_first_monthly?: boolean}
  | {id: string; type: 'assinatura_mensal'; label?: string; months?: number}
  | {id: string; type: 'anual'; label?: string; discount_pct?: number}
  | {id: string; type: 'por_usuario'; label?: string; unit_price_cents: number; users: number}
  | {id: string; type: 'consumo'; label?: string; unit_label: string; unit_price_cents: number; estimated_units?: number | null}
  | {id: string; type: 'personalizada'; label?: string; description: string; amount_cents?: number | null};

export interface PaymentRow {label: string; amount_cents: number | null; emphasis?: 'subtotal' | 'total' | 'info'; note?: string}
export interface PaymentResult {
  id: string;
  type: PaymentOption['type'];
  title: string;
  rows: PaymentRow[];
  /** Valor que entra na assinatura (entrada) — usado no QR Pix. */
  entry_cents: number | null;
  total_cents: number | null;
  /** taxa absorvida pela Argos (reduz o lucro) — informativo para a visão interna */
  absorbed_fee_cents: number;
}
type PaymentOption = PaymentOptionConfig;

const r = Math.round;

export function computePayment(
  opt: PaymentOptionConfig,
  ctx: {one_time_cents: number; monthly_cents: number}
): PaymentResult {
  const {one_time_cents: one, monthly_cents: mo} = ctx;
  const base: Omit<PaymentResult, 'rows' | 'title' | 'entry_cents' | 'total_cents'> = {id: opt.id, type: opt.type, absorbed_fee_cents: 0};

  switch (opt.type) {
    case 'a_vista': {
      const first = opt.include_first_monthly ? mo : 0;
      const rows: PaymentRow[] = [{label: 'Valor do projeto', amount_cents: one}];
      if (first) rows.push({label: '1ª mensalidade', amount_cents: first});
      rows.push({label: 'TOTAL À VISTA', amount_cents: one + first, emphasis: 'total'});
      return {...base, title: opt.label ?? 'Entrada à vista (Pix ou transferência)', rows, entry_cents: one + first, total_cents: one + first};
    }
    case 'entrada_mensalidades': {
      const first = opt.include_first_monthly ? mo : 0;
      const rows: PaymentRow[] = [{label: 'Valor do projeto (entrada)', amount_cents: one}];
      if (first) rows.push({label: '1ª mensalidade (inclui manutenção)', amount_cents: first});
      rows.push({label: 'TOTAL DA ENTRADA', amount_cents: one + first, emphasis: 'total'});
      rows.push({label: `Mensalidade a partir do ${first ? '2º' : '1º'} mês`, amount_cents: mo, emphasis: 'subtotal'});
      return {...base, title: opt.label ?? 'Entrada + mensalidades', rows, entry_cents: one + first, total_cents: one + first + (opt.months ? mo * (opt.months - (first ? 1 : 0)) : 0)};
    }
    case 'cartao': {
      const first = opt.include_first_monthly ? mo : 0;
      const entry = one + first;
      const baseCents = opt.base === 'inicial' ? entry : entry + mo * (12 - (first ? 1 : 0));
      const rows: PaymentRow[] = [];
      if (opt.base === 'primeiro_ano') {
        rows.push({label: 'Entrada (já com a 1ª mensalidade)', amount_cents: entry});
        rows.push({label: `Mensalidades do ${first ? '2º' : '1º'} ao 12º mês (${12 - (first ? 1 : 0)} × ${(mo / 100).toFixed(2).replace('.', ',')})`, amount_cents: mo * (12 - (first ? 1 : 0))});
        rows.push({label: 'SUBTOTAL DO PRIMEIRO ANO', amount_cents: baseCents, emphasis: 'subtotal'});
      } else rows.push({label: 'Valor base', amount_cents: baseCents, emphasis: 'subtotal'});
      const fee = opt.fee_pct;
      const total = opt.fee_passed && fee > 0 ? r(baseCents / (1 - fee / 100)) : baseCents;
      const feeCents = total - baseCents;
      if (opt.fee_passed && fee > 0) rows.push({label: `Taxa da maquininha, crédito em ${opt.installments}x (${String(fee).replace('.', ',')}%), repassada ao cliente`, amount_cents: feeCents});
      rows.push({label: 'TOTAL NO CARTÃO', amount_cents: total, emphasis: 'total'});
      rows.push({label: `${opt.installments} PARCELAS NO CARTÃO DE CRÉDITO (${opt.installments} × ${(r(total / opt.installments) / 100).toFixed(2).replace('.', ',')})`, amount_cents: r(total / opt.installments), emphasis: 'total'});
      return {...base, title: opt.label ?? `${opt.base === 'primeiro_ano' ? 'Primeiro ano' : 'Valor inicial'} no cartão de crédito em ${opt.installments}x`, rows,
        entry_cents: null, total_cents: total, absorbed_fee_cents: opt.fee_passed ? 0 : r(baseCents * fee / 100)};
    }
    case 'assinatura_mensal': {
      const rows: PaymentRow[] = [{label: 'Mensalidade', amount_cents: mo, emphasis: 'subtotal'}];
      if (opt.months) rows.push({label: `Total em ${opt.months} meses`, amount_cents: mo * opt.months, emphasis: 'total'});
      return {...base, title: opt.label ?? 'Assinatura mensal', rows, entry_cents: null, total_cents: opt.months ? mo * opt.months : null};
    }
    case 'anual': {
      const gross = mo * 12;
      const disc = r((gross * (opt.discount_pct ?? 0)) / 100);
      const rows: PaymentRow[] = [{label: '12 mensalidades', amount_cents: gross}];
      if (disc) rows.push({label: `Desconto de ${String(opt.discount_pct).replace('.', ',')}% no pagamento anual`, amount_cents: -disc});
      rows.push({label: 'TOTAL ANUAL', amount_cents: gross - disc, emphasis: 'total'});
      return {...base, title: opt.label ?? 'Pagamento anual', rows, entry_cents: gross - disc, total_cents: gross - disc};
    }
    case 'por_usuario': {
      const total = r(opt.unit_price_cents * opt.users);
      return {...base, title: opt.label ?? 'Cobrança por usuário', entry_cents: null, total_cents: total,
        rows: [{label: `${opt.users} usuário(s) × ${(opt.unit_price_cents / 100).toFixed(2).replace('.', ',')}`, amount_cents: total}, {label: 'TOTAL MENSAL', amount_cents: total, emphasis: 'total'}]};
    }
    case 'consumo': {
      const rows: PaymentRow[] = [{label: `Valor por ${opt.unit_label}`, amount_cents: opt.unit_price_cents}];
      let total: number | null = null;
      if (opt.estimated_units) { total = r(opt.unit_price_cents * opt.estimated_units); rows.push({label: `Estimativa: ${opt.estimated_units} ${opt.unit_label}(s)`, amount_cents: total, emphasis: 'info', note: 'valor estimado; cobrança pelo consumo real'}); }
      return {...base, title: opt.label ?? 'Cobrança por consumo', rows, entry_cents: null, total_cents: total};
    }
    case 'personalizada':
      return {...base, title: opt.label ?? 'Condição personalizada', rows: [{label: opt.description, amount_cents: opt.amount_cents ?? null}], entry_cents: opt.amount_cents ?? null, total_cents: opt.amount_cents ?? null};
  }
}
