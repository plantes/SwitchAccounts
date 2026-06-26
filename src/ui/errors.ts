import type { OperationError } from "../domain/models";

export function toSafeErrorText(error: OperationError): string {
  const details = formatSafeDetails(error.details);
  return details ? `${error.message}（${details}）` : error.message;
}

function formatSafeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const safe = details as Record<string, unknown>;
  return Object.entries(safe)
    .filter(([key]) => ["stage", "name", "domain", "code"].includes(key))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("，");
}
