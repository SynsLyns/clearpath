import Link from "next/link";
import { Clock3 } from "lucide-react";
import { statusClass, statusLabel, titleCase } from "@/lib/format";
import { getSubmissionVersionLineage, type SubmissionRecord } from "@/lib/repository";

export function SubmissionVersionHistory({
  submissions,
  currentId,
  hrefFor,
}: {
  submissions: readonly SubmissionRecord[];
  currentId: string;
  hrefFor: (id: string) => string;
}) {
  const versions = getSubmissionVersionLineage(submissions, currentId);
  if (!versions.length) return null;

  return (
    <section className="content-card compact-card">
      <div className="content-card-heading">
        <div><Clock3 size={17} /><h2>Version history</h2></div>
        <span>{versions.length} {versions.length === 1 ? "version" : "versions"}</span>
      </div>
      <div className="version-history">
        {versions.map((item) => item.id === currentId ? (
          <div className="version-history-item current" key={item.id} aria-current="true">
            <span className="version-dot" />
            <span>
              <strong>v{item.version} · This request</strong>
              <small><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></small>
            </span>
          </div>
        ) : (
          <Link href={hrefFor(item.id)} className="version-history-item" key={item.id}>
            <span className="version-dot" />
            <span>
              <strong>v{item.version} · {item.parentId ? "Updated request" : "Original request"}</strong>
              <small>{titleCase(item.status)}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
