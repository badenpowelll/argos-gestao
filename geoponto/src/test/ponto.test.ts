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
