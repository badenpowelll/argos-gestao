import crypto from 'node:crypto';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {HttpError} from '../http.js';

export const MAX_UPLOAD = 15 * 1024 * 1024;
export const ALLOWED = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain'
} as const;

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Detecta o tipo pelo conteúdo (assinatura), não pelo nome/cabeçalho enviado pelo cliente. */
export function sniff(buf: Buffer): keyof typeof ALLOWED | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buf.includes(Buffer.from('word/'))) return 'docx';
  const head = buf.subarray(0, 4000);
  if (!head.includes(0)) return 'txt';
  return null;
}

export async function extractText(buf: Buffer, type: keyof typeof ALLOWED): Promise<{text: string; pages: string[]}> {
  if (type === 'txt') {
    const t = buf.toString('utf8');
    return {text: t, pages: [t]};
  }
  if (type === 'docx') {
    const r = await mammoth.extractRawText({buffer: buf});
    return {text: r.value, pages: [r.value]};
  }
  const pages: string[] = [];
  try {
    await pdfParse(buf, {
      pagerender: async (page: {getTextContent: () => Promise<{items: {str: string; transform: number[]}[]}>}) => {
        const content = await page.getTextContent();
        let lastY: number | undefined;
        let text = '';
        for (const item of content.items) {
          const y = item.transform[5];
          text += lastY === undefined || lastY === y ? item.str : `\n${item.str}`;
          lastY = y;
        }
        pages.push(text);
        return text;
      }
    });
  } catch {
    throw new HttpError(422, 'Não foi possível ler o PDF (arquivo corrompido ou protegido)', 'unreadable_pdf');
  }
  return {text: pages.join('\n\n'), pages};
}
