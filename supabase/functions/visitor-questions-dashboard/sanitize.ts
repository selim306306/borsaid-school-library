import { containsSensitivePersonalData } from "./privacy-guard.js";

export type ReplySource = "gemini" | "telegram" | "local" | null;
export type TextKind = "question" | "reply";

export function normalizeReplySource(value: unknown): ReplySource {
  return value === "gemini" || value === "telegram" || value === "local" ? value : null;
}

export function sanitizeOwnerDisplayText(value: unknown, kind: TextKind): string {
  if (typeof value !== "string" || !value) return "";
  if (!containsSensitivePersonalData(value)) return value;
  return kind === "question"
    ? "حُجب نص السؤال تلقائيًا لاحتوائه على بيانات شخصية أو معلومات حساسة."
    : "حُجب نص الرد تلقائيًا لاحتوائه على بيانات شخصية أو معلومات حساسة.";
}
