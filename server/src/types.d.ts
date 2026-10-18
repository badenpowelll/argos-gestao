declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfOptions {
    pagerender?: (page: any) => Promise<string> | string;
    max?: number;
  }
  export default function pdfParse(data: Buffer, options?: PdfOptions): Promise<{numpages: number; text: string}>;
}
