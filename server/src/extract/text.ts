import crypto from 'node:crypto';
import mammoth from 'mammoth';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {HttpError} from '../http.js';

export const MAX_UPLOAD = 15 * 1024 * 1024;
export const ALLOWED = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  json: 'application/json'
} as const;

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Detecta o tipo pelo conteúdo (assinatura), não pelo nome/cabeçalho enviado pelo cliente. */
export function sniff(buf: Buffer): keyof typeof ALLOWED | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buf.includes(Buffer.from('word/'))) return 'docx';
  const head = buf.subarray(0, 4000);
  if (head.includes(0)) return null;
  const start = buf.toString('utf8', 0, 20).replace(/^﻿/, '').trimStart();
  if (start.startsWith('{')) {
    try { JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); return 'json'; } catch { /* texto comum que começa com { */ }
  }
  return 'txt';
}

export async function extractText(buf: Buffer, type: keyof typeof ALLOWED): Promise<{text: string; pages: string[]}> {
  if (type === 'txt' || type === 'json') {
    const t = buf.toString('utf8');
    return {text: t, pages: [t]};
  }
  if (type === 'docx') {
    const r = await mammoth.extractRawText({buffer: buf});
    return {text: r.value, pages: [r.value]};
  }
  const pages: string[] = [];
  const task = getDocument({data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0});
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let lastY: number | undefined;
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5] as number);
        text += lastY === undefined || Math.abs(lastY - y) < 2 ? item.str : `\n${item.str}`; // nova linha quando a posição vertical muda
        lastY = y;
      }
      pages.push(text);
    }
  } catch {
    throw new HttpError(422, 'Não foi possível ler o PDF (arquivo corrompido ou protegido)', 'unreadable_pdf');
  } finally {
    await task.destroy().catch(() => undefined);
  }
  return {text: pages.join('\n\n'), pages};
}

