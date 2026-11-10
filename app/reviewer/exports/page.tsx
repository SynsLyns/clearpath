import Link from "next/link";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { ExportButton } from "@/components/export-button";
import { TimeAgo } from "@/components/time-ago";
import {
  buildExports,
  defaultExportFilters,
  EXPORT_KINDS,
  ExportFilterError,
  parseExportFilters,
  type ExportFilters,
  type ExportKind,
} from "@/lib/exports";
import { CHANNELS, PRODUCTS, STATUSES } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { db } from "@/src/prisma/db";

export const dynamic = "force-dynamic";

const EXPORT_INFO: Record<ExportKind, { title: string; description: string }> = {
  submissions: {
    title: "Submissions register",
    description: "Current status, risk, review timing, version chain, and attachment names.",
  },
  decisions: {
    title: "Decision log",
    description: "Every human and system decision with reasons, comments, and timing.",
  },
  audit_events: {
    title: "Audit events",
    description: "Submission activity with actors and recorded details.",
  },
  flags: {
    title: "Flag detail",
    description: "Failed rules, authority, snippets, and dismissal history.",
  },
};

function filterSummary(serialized: string): string {
  if (!serialized) return "Compliance record";
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Saved filters";
    }
    const values = parsed as Record<string, unknown>;
    const summary = [
      typeof values.from === "string" && values.from ? `From ${values.from}` : "",
      typeof values.to === "string" && values.to ? `to ${values.to}` : "",
      typeof values.partner === "string" && values.partner ? `Partner: ${values.partner}` : "",
      typeof values.product === "string" && values.product ? `Product: ${titleCase(values.product)}` : "",
      typeof values.channel === "string" && values.channel ? `Channel: ${titleCase(values.channel)}` : "",
      typeof values.status === "string" && values.status ? `Status: ${titleCase(values.status)}` : "",
      values.includeCreativeText === true ? "Creative text included" : "",
    ].filter(Boolean);
    return summary.join(" · ") || "No filters";
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return "Saved filters";
  }
}

function parsePageFilters(
  query: Record<string, string | string[] | undefined>,
): ExportFilters {
  const params: Record<string, string | undefined> = {};
  for (const key of ["from", "to", "partner", "product", "channel", "status", "includeCreativeText"]) {
    const value = query[key];
    if (Array.isArray(value)) {
      throw new ExportFilterError("Each filter can only be supplied once.");
    }
    params[key] = value;
  }
  return parseExportFilters(params);
}

export default async function ReviewerExportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("reviewer");
  const query = await searchParams;
  let filters = defaultExportFilters();
  let filterError = "";
  try {
    filters = parsePageFilters(query);
  } catch (error) {
    if (!(error instanceof ExportFilterError)) throw error;
    filterError = error.message;
  }

  const [results, logs] = await Promise.all([
    filterError ? Promise.resolve(null) : buildExports(filters),
    db.orm.public.ExportLog.orderBy((log) => log.createdAt.desc()).all(),
  ]);
  const recentLogs = logs.slice(0, 10);

  return (
    <>
      <PageContainer>
        <PageHeading
          eyebrow="Compliance workspace"
          title="Exports"
          description="Create reviewer-only, audited CSV extracts or print a submission compliance record."
          action={<Link className="button button-outline" href="/reviewer">Review queue</Link>}
        />
        <section className="content-card export-filter-card">
          <div className="content-card-heading">
            <div><ShieldCheck size={17} /><h2>Export filters</h2></div>
            <span>All dates and times are UTC.</span>
          </div>
          <form className="export-filter-form" method="get">
            <label>
              <span>From date (UTC)</span>
              <input type="date" name="from" defaultValue={filterError ? "" : filters.from} />
            </label>
            <label>
              <span>To date (UTC)</span>
              <input type="date" name="to" defaultValue={filterError ? "" : filters.to} />
            </label>
            <label className="export-filter-wide">
              <span>Partner or campaign</span>
              <input
                type="search"
                name="partner"
                defaultValue={filterError ? "" : filters.partner}
                maxLength={200}
                placeholder="Search partner or campaign"
              />
            </label>
            <label>
              <span>Product</span>
              <select name="product" defaultValue={filterError ? "" : filters.product}>
                <option value="">All products</option>
                {PRODUCTS.map((product) => <option key={product} value={product}>{titleCase(product)}</option>)}
              </select>
            </label>
            <label>
              <span>Channel</span>
              <select name="channel" defaultValue={filterError ? "" : filters.channel}>
                <option value="">All channels</option>
                {CHANNELS.map((channel) => <option key={channel} value={channel}>{titleCase(channel)}</option>)}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={filterError ? "" : filters.status}>
                <option value="">All statuses</option>
                {STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
              </select>
            </label>
            <label className="export-checkbox">
              <input
                type="checkbox"
                name="includeCreativeText"
                value="true"
                defaultChecked={!filterError && filters.includeCreativeText}
              />
              <span>Include creative text in the submissions register</span>
            </label>
            <div className="export-filter-actions">
              <button className="button button-primary" type="submit">Update filters</button>
              <Link className="button button-outline" href="/reviewer/exports">Clear filters</Link>
            </div>
          </form>
          {filterError && <p className="export-filter-error" role="alert">{filterError}</p>}
        </section>

        <section className="export-grid" aria-label="CSV exports">
          {EXPORT_KINDS.map((kind) => {
            const count = results?.[kind].rows.length ?? 0;
            return (
              <article className="content-card export-card" key={kind}>
                <div className="export-card-icon"><Download size={18} /></div>
                <div className="export-card-copy">
                  <h2>{EXPORT_INFO[kind].title}</h2>
                  <p>{EXPORT_INFO[kind].description}</p>
                </div>
                <strong className="export-row-count">
                  {filterError ? "Fix filters to view count" : `${count} ${count === 1 ? "row" : "rows"} match`}
                </strong>
                {kind === "submissions" && (
                  <small>Creative text is excluded unless selected above. Attachment URLs are never included.</small>
                )}
                <ExportButton kind={kind} filters={filters} disabled={Boolean(filterError) || count === 0} />
                {!filterError && count === 0 && <span className="export-empty-note">No rows match these filters.</span>}
              </article>
            );
          })}
        </section>

        <section className="list-panel export-history">
          <div className="list-panel-top">
            <div>
              <h2>Recent exports</h2>
              <p>Downloads and printable records generated by reviewers.</p>
            </div>
          </div>
          {recentLogs.length ? (
            <div className="table-scroll">
              <table className="submission-table">
                <thead><tr><th>Who</th><th>What</th><th>Filters</th><th>Rows</th><th>When</th></tr></thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.actor}</td>
                      <td><span className="export-log-kind"><FileText size={14} />{titleCase(log.kind)}</span></td>
                      <td className="export-log-filters">{filterSummary(log.filters)}</td>
                      <td>{log.rowCount}</td>
                      <td><TimeAgo date={log.createdAt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state export-history-empty">
              <div className="empty-icon"><FileText size={21} /></div>
              <h3>No exports yet</h3>
              <p>Completed CSV downloads and compliance records will appear here.</p>
            </div>
          )}
        </section>
      </PageContainer>
      <PageFooter />
    </>
  );
}
