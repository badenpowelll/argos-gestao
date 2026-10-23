export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const isValidCpf = (value: string): boolean => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

export const formatCpf = (value: string): string => {
  const d = onlyDigits(value).slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) => `${a}.${b}.${c}${e ? `-${e}` : ""}`).replace(/\.$/, "");
};

/** Mostra só os 3 primeiros e os 2 últimos dígitos (comprovantes e telas de uso geral). */
export const maskCpf = (value: string): string => {
  const d = onlyDigits(value);
  return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : "";
};
