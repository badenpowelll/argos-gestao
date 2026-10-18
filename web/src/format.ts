export const brl = (cents: number | null | undefined): string =>
  ((cents ?? 0) / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

export const dateBR = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

export const dateTimeBR = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'}) : '—';

/** "1.499,80" | "148" | "R$ 34,99" -> centavos (null se inválido). */
export function toCents(text: string): number | null {
  const t = text.replace(/R\$\s*/i, '').trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [i = '0', d = ''] = t.replace(/\./g, '').split(',');
  return Number(i) * 100 + Number(d.padEnd(2, '0'));
}
export const fromCents = (c: number | null | undefined): string =>
  c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ',');

export function formatDocument(doc: string | null | undefined): string {
  const s = (doc ?? '').replace(/\D/g, '');
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc ?? '';
}

export const LABELS: Record<string, string> = {
  pessoa_fisica: 'Pessoa física', empresa_privada: 'Empresa privada', orgao_publico: 'Órgão público',
  prospecto: 'Prospecto', ativo: 'Ativo', inativo: 'Inativo',
  rascunho: 'Rascunho', proposta: 'Proposta', contrato: 'Contrato', aditivo: 'Aditivo', suspenso: 'Suspenso', encerrado: 'Encerrado', cancelado: 'Cancelado',
  pendente: 'Pendente', parcial: 'Parcial', paga: 'Paga', vencida: 'Vencida', cancelada: 'Cancelada', estornado: 'Estornado', confirmado: 'Confirmado',
  em_desenvolvimento: 'Em desenvolvimento', em_producao: 'Em produção', manutencao: 'Manutenção', descontinuado: 'Descontinuado',
  pix: 'Pix', transferencia: 'Transferência', cartao: 'Cartão', boleto: 'Boleto', dinheiro: 'Dinheiro',
  unico: 'Único', recorrente: 'Recorrente', parcelado: 'Parcelado', por_usuario: 'Por usuário', sob_demanda: 'Sob demanda',
  implementacao: 'Implementação', desenvolvimento: 'Desenvolvimento', licenca: 'Licença', mensalidade: 'Mensalidade', hospedagem: 'Hospedagem',
  dominio: 'Domínio', treinamento: 'Treinamento', suporte: 'Suporte', outro: 'Outro',
  admin: 'Administrador', financeiro: 'Financeiro', operador: 'Operador', leitura: 'Somente leitura',
  telefone: 'Telefone', email: 'E-mail', whatsapp: 'WhatsApp', presencial: 'Presencial'
};
export const label = (k: string | null | undefined): string => (k ? (LABELS[k] ?? k) : '—');

export const newKey = (): string => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
