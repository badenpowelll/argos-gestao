export type ClosingStatus =
  | "aberto"
  | "em_apuracao"
  | "com_pendencias"
  | "conferido"
  | "aprovado_rh"
  | "exportado_folha"
  | "processado"
  | "conciliado"
  | "encerrado"
  | "substituido";

export const STATUS_LABEL: Record<ClosingStatus, string> = {
  aberto: "Aberto",
  em_apuracao: "Em apuração",
  com_pendencias: "Com pendências",
  conferido: "Conferido",
  aprovado_rh: "Aprovado pelo RH",
  exportado_folha: "Enviado à folha",
  processado: "Processado",
  conciliado: "Conciliado",
  encerrado: "Encerrado",
  substituido: "Substituído por retificação",
};

/** Espelha as transições da função SQL `closing_transition` (docs/migrations-propostas/002). */
const TRANSITIONS: Record<string, ClosingStatus[]> = {
  em_apuracao: ["com_pendencias", "conferido"],
  com_pendencias: ["em_apuracao", "conferido"],
  conferido: ["com_pendencias", "aprovado_rh"],
  aprovado_rh: ["exportado_folha"],
  exportado_folha: ["processado"],
  processado: ["conciliado"],
  conciliado: ["encerrado"],
};

const HR_ONLY: ClosingStatus[] = ["aprovado_rh", "exportado_folha", "processado", "conciliado", "encerrado"];
const LOCKED: ClosingStatus[] = ["aprovado_rh", "exportado_folha", "processado", "conciliado", "encerrado"];

export type Role = "owner" | "admin" | "manager" | "employee" | null;

export const isHr = (role: Role) => role === "owner" || role === "admin";

/** Próximas etapas que o perfil pode executar. A aprovação do RH também exige que quem aprova não seja quem criou. */
export const allowedTransitions = (status: ClosingStatus, role: Role, isCreator: boolean): ClosingStatus[] =>
  (TRANSITIONS[status] ?? []).filter((to) => {
    if (HR_ONLY.includes(to) && !isHr(role)) return false;
    if (to === "aprovado_rh" && isCreator) return false;
    return role === "manager" || isHr(role);
  });

export const isLocked = (status: ClosingStatus) => LOCKED.includes(status);

export const canRectify = (status: ClosingStatus, role: Role) => isLocked(status) && isHr(role);
