"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { logRecordExport } from "@/app/actions";

export function PrintRecordButton({ submissionId }: { submissionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function printRecord() {
    setError("");
    startTransition(async () => {
      try {
        await logRecordExport(submissionId);
        window.print();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The record could not be logged.");
      }
    });
  }

  return (
    <div className="print-record-control">
      <button className="button button-primary no-print" type="button" onClick={printRecord} disabled={isPending}>
        <Printer size={15} />
        {isPending ? "Preparing record…" : "Print / Save as PDF"}
      </button>
      {error && <p className="export-message export-message-error no-print" role="alert">{error}</p>}
    </div>
  );
}
