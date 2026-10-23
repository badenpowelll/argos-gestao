import { format, parseISO } from "date-fns";

export interface PunchRecord {
  id: string;
  user_id: string;
  timestamp: string;
  type: "in" | "out";
}

export interface ChainedPunch extends PunchRecord {
  nsr: number;
  hash: string;
  prevHash: string;
}

export const GENESIS_HASH = "0".repeat(64);

export const sha256Hex = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/**
 * Numera as marcações (NSR) em ordem cronológica e encadeia um hash SHA-256 em cada
 * uma. Alterar ou apagar qualquer registro muda todos os hashes seguintes.
 */
export const buildChain = async (punches: PunchRecord[], cnpj: string): Promise<ChainedPunch[]> => {
  const sorted = [...punches].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
  const result: ChainedPunch[] = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const nsr = i + 1;
    const hash = await sha256Hex([prevHash, nsr, onlyDigits(cnpj), p.user_id, p.timestamp, p.type].join("|"));
    result.push({ ...p, nsr, hash, prevHash });
    prevHash = hash;
  }
  return result;
};

/** Recalcula a cadeia e devolve o NSR do primeiro registro divergente (ou null se íntegra). */
export const verifyChain = async (chain: ChainedPunch[], cnpj: string): Promise<number | null> => {
  const rebuilt = await buildChain(chain, cnpj);
  for (let i = 0; i < chain.length; i++) {
    if (rebuilt[i].hash !== chain[i].hash) return chain[i].nsr;
  }
  return null;
};

const pad = (v: string | number, size: number, char = "0") => String(v).padStart(size, char).slice(-size);

/**
 * Arquivo de marcações em texto de largura fixa, inspirado no AFD da Portaria 671/2021.
 * Layout simplificado: não substitui a validação oficial do MTE.
 */
export const buildAfd = (chain: ChainedPunch[], cnpj: string, companyName: string, cpfByUser: Record<string, string> = {}): string => {
  const lines: string[] = [];
  const first = chain[0]?.timestamp ?? new Date().toISOString();
  const last = chain[chain.length - 1]?.timestamp ?? first;
  lines.push(
    [
      pad(0, 9),
      "1",
      "1",
      pad(onlyDigits(cnpj), 14),
      pad("", 14),
      companyName.slice(0, 150).padEnd(150, " "),
      format(parseISO(first), "yyyy-MM-dd"),
      format(parseISO(last), "yyyy-MM-dd"),
      format(new Date(), "yyyy-MM-dd'T'HH:mmxx"),
    ].join(""),
  );
  for (const p of chain) {
    lines.push(
      [
        pad(p.nsr, 9),
        "7",
        format(parseISO(p.timestamp), "yyyy-MM-dd'T'HH:mmxx"),
        pad(onlyDigits(cpfByUser[p.user_id] ?? ""), 12),
        p.type === "in" ? "E" : "S",
        p.hash.slice(0, 64),
      ].join(""),
    );
  }
  lines.push([pad(chain.length, 9), "9"].join(""));
  return lines.join("\r\n") + "\r\n";
};

export const buildComprovante = (p: ChainedPunch, employeeName: string, companyName: string, cnpj: string): string =>
  [
    "COMPROVANTE DE REGISTRO DE PONTO",
    `Empregador: ${companyName}`,
    `CNPJ: ${cnpj}`,
    `Trabalhador: ${employeeName}`,
    `NSR: ${p.nsr}`,
    `Data/hora: ${format(parseISO(p.timestamp), "dd/MM/yyyy HH:mm:ss")}`,
    `Tipo: ${p.type === "in" ? "Entrada" : "Saída"}`,
    `Código de integridade: ${p.hash}`,
  ].join("\n");
