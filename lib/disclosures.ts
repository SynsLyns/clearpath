import { CLEARPATH_NMLS_ID } from "./constants";

export function appendStandardDisclosures(text: string) {
  const missing: string[] = [];
  if (!/ClearPath Financial/i.test(text)) missing.push("ClearPath Financial.");
  if (!/Equal Housing Lender/i.test(text)) missing.push("Equal Housing Lender.");
  if (!/(advertisement|sponsored|#ad\b)/i.test(text)) missing.push("Advertisement.");
  if (!/NMLS\s*#?\s*\d+/i.test(text)) missing.push(`NMLS #${CLEARPATH_NMLS_ID}.`);
  if (!missing.length) return text;
  return `${text.trim()}${text.trim() ? "\n" : ""}${missing.join(" ")}`;
}
