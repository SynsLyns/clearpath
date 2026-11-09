"use client";

import { archiveSubmission } from "@/app/actions";

export function ArchiveRequestButton({ submissionId }: { submissionId: string }) {
  const action = archiveSubmission.bind(null, submissionId);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Archive this request and all of its versions? Compliance will retain the history.")) {
          event.preventDefault();
        }
      }}
    >
      <button className="archive-button" type="submit">Archive request</button>
    </form>
  );
}
