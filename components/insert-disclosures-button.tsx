"use client";

import { appendStandardDisclosures } from "@/lib/disclosures";

export function InsertDisclosuresButton({
  text,
  onInsert,
}: {
  text: string;
  onInsert: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className="button button-outline disclosure-insert-button"
      onClick={() => onInsert(appendStandardDisclosures(text))}
    >
      Insert standard disclosures
    </button>
  );
}
