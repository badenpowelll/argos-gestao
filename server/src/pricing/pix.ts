/**
 * Pix "copia e cola" (BR Code / EMV-MPM, Manual de Padrões do Pix – Banco Central).
 * Gera e VALIDA o payload (estrutura TLV, campos obrigatórios, tamanhos e CRC16).
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');

export interface PixParams {
  key: string;
  receiver_name: string; // até 25
  city: string; // até 15
  amount_cents?: number | null;
  txid?: string | null; // 1–25 alfanumérico; padrão '***'
  description?: string | null;
}

export function buildPixPayload(p: PixParams): string {
  const key = p.key.trim();
  if (!key) throw new Error('Chave Pix obrigatória');
  const name = ascii(p.receiver_name).trim().toUpperCase().slice(0, 25);
  const city = ascii(p.city).trim().toUpperCase().slice(0, 15);
  if (!name || !city) throw new Error('Nome do recebedor e cidade são obrigatórios');
  let account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  if (p.description) account += tlv('02', ascii(p.description).slice(0, 40));
  if (account.length > 99) throw new Error('Campo da conta excede o tamanho permitido');
  const txid = p.txid ? p.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***' : '***';
  let body =
    tlv('00', '01') +
    tlv('01', p.amount_cents ? '12' : '11') + // 12 = uso único (com valor); 11 = reutilizável
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986');
  if (p.amount_cents && p.amount_cents > 0) body += tlv('54', (p.amount_cents / 100).toFixed(2));
  body += tlv('58', 'BR') + tlv('59', name) + tlv('60', city) + tlv('62', tlv('05', txid));
  body += '6304';
  return body + crc16(body);
}

export interface PixValidation {
  valid: boolean;
  errors: string[];
  fields: Record<string, string>;
}

function parseTlv(s: string): {id: string; value: string}[] | null {
  const out: {id: string; value: string}[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(len) || i + 4 + len > s.length) return null;
    out.push({id, value: s.slice(i + 4, i + 4 + len)});
    i += 4 + len;
  }
  return out;
}

export function validatePixPayload(payload: string): PixValidation {
  const errors: string[] = [];
  const fields: Record<string, string> = {};
  const tags = parseTlv(payload);
  if (!tags) return {valid: false, errors: ['Estrutura TLV inválida'], fields};
  const get = (id: string) => tags.find((t) => t.id === id)?.value;
  if (tags[0]?.id !== '00' || get('00') !== '01') errors.push('Campo 00 (formato) deve ser 01 e ser o primeiro');
  if (tags[tags.length - 1]?.id !== '63') errors.push('CRC (63) deve ser o último campo');
  const crc = get('63');
  if (!crc || crc.length !== 4) errors.push('CRC ausente');
  else if (crc16(payload.slice(0, payload.length - 4)) !== crc.toUpperCase()) errors.push('CRC16 inválido');
  const acct = get('26');
  const inner = acct ? parseTlv(acct) : null;
  if (!inner || inner.find((t) => t.id === '00')?.value.toLowerCase() !== 'br.gov.bcb.pix') errors.push('Conta Pix (26/00) ausente ou diferente de br.gov.bcb.pix');
  const key = inner?.find((t) => t.id === '01')?.value;
  if (!key) errors.push('Chave Pix (26/01) ausente');
  if (get('52') === undefined) errors.push('MCC (52) ausente');
  if (get('53') !== '986') errors.push('Moeda (53) deve ser 986 (BRL)');
  const amount = get('54');
  if (amount !== undefined && !/^\d+\.\d{2}$/.test(amount)) errors.push('Valor (54) em formato inválido');
  if (get('58') !== 'BR') errors.push('País (58) deve ser BR');
  const name = get('59');
  if (!name || name.length > 25) errors.push('Nome do recebedor (59) ausente ou maior que 25');
  const city = get('60');
  if (!city || city.length > 15) errors.push('Cidade (60) ausente ou maior que 15');
  if (!get('62')) errors.push('Campo adicional (62/05 txid) ausente');
  fields.key = key ?? '';
  fields.name = name ?? '';
  fields.city = city ?? '';
  if (amount) fields.amount = amount;
  return {valid: errors.length === 0, errors, fields};
}

/** Chave Pix aleatória (EVP) = UUID v4. CNPJ = 14 dígitos. */
export function validatePixKey(key: string): boolean {
  const k = key.trim();
  return /^\d{14}$/.test(k) || /^\d{11}$/.test(k) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k) || /^\+55\d{10,11}$/.test(k) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k);
}
