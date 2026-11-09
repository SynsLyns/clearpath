"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function SubmissionTableRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function navigate(event: MouseEvent<HTMLTableRowElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("a, button, input, select, textarea")
    ) return;
    router.push(href);
  }

  return (
    <tr className="submission-row" onClick={navigate}>{children}</tr>
  );
}
