export type ClassValue = string | false | null | undefined;
/** Junta classes ignorando valores falsos. */
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
