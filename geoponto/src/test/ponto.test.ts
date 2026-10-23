import { describe, expect, it } from "vitest";
import { buildChain, verifyChain, buildAfd } from "@/utils/portaria671";
import { closeMonth, hasInconsistency } from "@/utils/monthlyClosing";

const p = (id: string, ts: string, type: "in" | "out") => ({ id, user_id: "u1", timestamp: ts, type });

describe("portaria671", () => {
  const punches = [
    p("a", "2025-03-03T11:00:00.000Z", "in"),
    p("b", "2025-03-03T15:00:00.000Z", "out"),
  ];
  it("encadeia e detecta adulteração", async () => {
    const chain = await buildChain(punches, "12.345.678/0001-90");
    expect(chain.map((c) => c.nsr)).toEqual([1, 2]);
    expect(await verifyChain(chain, "12.345.678/0001-90")).toBeNull();
    chain[0] = { ...chain[0], timestamp: "2025-03-03T10:00:00.000Z" };
    expect(await verifyChain(chain, "12.345.678/0001-90")).toBe(1);
  });
  it("gera AFD com cabeçalho e trailer", async () => {
    const afd = buildAfd(await buildChain(punches, "12345678000190"), "12345678000190", "Empresa");
    const lines = afd.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("0000000029");
  });
});

describe("fechamento mensal", () => {
  it("apura hora extra, falta e tolerância", () => {
    // março/2025: dias úteis seguem calendário; só 03 e 04 têm marcações
    const entries = [
      { timestamp: "2025-03-10T08:00:00", type: "in" as const },
      { timestamp: "2025-03-10T18:00:00", type: "out" as const }, // 10h => +2h
      { timestamp: "2025-03-12T08:00:00", type: "in" as const },
      { timestamp: "2025-03-12T16:05:00", type: "out" as const }, // 8h05 => tolerância
    ];
    const c = closeMonth(new Date(2025, 2, 10), entries, 8, new Set(), new Date(2025, 2, 14));
    const d3 = c.days.find((d) => d.dateKey === "2025-03-10")!;
    expect(d3.extra).toBe(120);
    expect(c.days.find((d) => d.dateKey === "2025-03-12")!.extra).toBe(0);
    expect(c.absences).toBe(c.days.filter((d) => d.absent).length);
    expect(c.absences).toBeGreaterThan(0);
  });
  it("detecta entrada sem saída", () => {
    expect(hasInconsistency([{ timestamp: "2025-03-03T08:00:00", type: "in" }])).toBe(true);
  });
});

import { findAnomalies } from "@/utils/portaria671";

describe("anomalias de marcação", () => {
  const mk = async (rows: [string, "in" | "out"][]) =>
    buildChain(rows.map(([ts, type], i) => ({ id: String(i), user_id: "u1", timestamp: ts, type })), "12345678000190");

  it("não aponta nada em jornada completa", async () => {
    const chain = await mk([
      ["2025-03-10T11:00:00.000Z", "in"],
      ["2025-03-10T15:00:00.000Z", "out"],
      ["2025-03-10T16:00:00.000Z", "in"],
      ["2025-03-10T20:00:00.000Z", "out"],
    ]);
    expect(findAnomalies(chain)).toEqual([]);
  });
  it("aponta entrada sem saída, saída sem entrada e duplicada", async () => {
    const chain = await mk([
      ["2025-03-10T11:00:00.000Z", "in"],
      ["2025-03-10T11:00:30.000Z", "in"], // duplicada
      ["2025-03-11T11:00:00.000Z", "in"], // a de 10/03 ficou sem saída
      ["2025-03-11T15:00:00.000Z", "out"],
      ["2025-03-12T15:00:00.000Z", "out"], // saída sem entrada
    ]);
    const kinds = findAnomalies(chain).map((a) => a.kind);
    expect(kinds).toContain("marcacao_duplicada");
    expect(kinds).toContain("entrada_sem_saida");
    expect(kinds).toContain("saida_sem_entrada");
  });
});

import { verifyPersisted, sha256Hex, canonicalTimestamp, hasClockDivergence, GENESIS_HASH, type PersistedPunch } from "@/utils/portaria671";
import { isValidCpf, formatCpf, maskCpf } from "@/utils/cpf";

describe("marcações gravadas (migration 003)", () => {
  const make = async (): Promise<PersistedPunch[]> => {
    const rows: PersistedPunch[] = [];
    let prev = GENESIS_HASH;
    for (const [i, [ts, type]] of ([["2025-03-10T11:00:00.000Z", "in"], ["2025-03-10T15:00:00.123Z", "out"]] as const).entries()) {
      const nsr = i + 6; // continua após 5 registros legados
      const hash = await sha256Hex([prev, nsr, "12345678000190", "u1", canonicalTimestamp(ts), type].join("|"));
      rows.push({ id: String(i), user_id: "u1", timestamp: ts, type, nsr, prev_hash: prev, record_hash: hash, server_received_at: ts, clock_offset_seconds: 0 });
      prev = hash;
    }
    return rows;
  };
  it("aceita a cadeia íntegra e aponta adulteração", async () => {
    const rows = await make();
    expect(await verifyPersisted(rows, "12.345.678/0001-90")).toBeNull();
    rows[1] = { ...rows[1], timestamp: "2025-03-10T16:00:00.000Z" };
    expect(await verifyPersisted(rows, "12.345.678/0001-90")).toBe(7);
  });
  it("aponta elo quebrado entre registros", async () => {
    const rows = await make();
    rows[1] = { ...rows[1], prev_hash: "x" };
    expect(await verifyPersisted(rows, "12.345.678/0001-90")).toBe(7);
  });
  it("sinaliza relógio divergente acima de 5 minutos", () => {
    expect(hasClockDivergence({ clock_offset_seconds: 7200 })).toBe(true);
    expect(hasClockDivergence({ clock_offset_seconds: -299 })).toBe(false);
    expect(hasClockDivergence({ clock_offset_seconds: null })).toBe(false);
  });
});

describe("CPF", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata e mascara", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("52998224725")).toBe("529.***.***-25");
  });
});
