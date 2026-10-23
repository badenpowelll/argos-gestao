import { describe, expect, it } from "vitest";
import { allowedTransitions, canRectify, isLocked } from "@/utils/closingWorkflow";

describe("fluxo do fechamento", () => {
  it("gestor confere, mas não aprova pelo RH", () => {
    expect(allowedTransitions("em_apuracao", "manager", true)).toEqual(["com_pendencias", "conferido"]);
    expect(allowedTransitions("conferido", "manager", false)).toEqual(["com_pendencias"]);
  });
  it("RH aprova, desde que não seja quem criou a apuração", () => {
    expect(allowedTransitions("conferido", "admin", false)).toContain("aprovado_rh");
    expect(allowedTransitions("conferido", "admin", true)).not.toContain("aprovado_rh");
  });
  it("não há atalhos entre estados", () => {
    expect(allowedTransitions("em_apuracao", "admin", false)).not.toContain("aprovado_rh");
    expect(allowedTransitions("encerrado", "owner", false)).toEqual([]);
    expect(allowedTransitions("substituido", "owner", false)).toEqual([]);
  });
  it("funcionário não executa nada", () => {
    expect(allowedTransitions("conferido", "employee", false)).toEqual([]);
  });
  it("bloqueio e retificação valem a partir da aprovação do RH, só para o RH", () => {
    expect(isLocked("conferido")).toBe(false);
    expect(isLocked("aprovado_rh")).toBe(true);
    expect(canRectify("aprovado_rh", "admin")).toBe(true);
    expect(canRectify("aprovado_rh", "manager")).toBe(false);
    expect(canRectify("conferido", "admin")).toBe(false);
  });
});
