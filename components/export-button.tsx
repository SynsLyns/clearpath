"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportCsv } from "@/app/actions";
import type { ExportFilters, ExportKind } from "@/lib/exports";

export function ExportButton({
  kind,
  filters,
  disabled,
}: {
  kind: ExportKind;
  filters: ExportFilters;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function download() {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await exportCsv(kind, filters);
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        const time = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(result.loggedAt));
        setMessage(`Exported ${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"}, logged at ${time}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The export could not be created.");
      }
    });
  }

  return (
    <div className="export-button-wrap">
      <button
        className="button button-primary"
        type="button"
        onClick={download}
        disabled={disabled || isPending}
      >
        <Download size={15} />
        {isPending ? "Preparing export…" : "Download CSV"}
      </button>
      {message && (
        <p className={message.startsWith("Exported ") ? "export-message" : "export-message export-message-error"} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
