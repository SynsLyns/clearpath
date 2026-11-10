import Link from "next/link";
import { ArrowUpRight, CircleCheck, Command, ShieldCheck } from "lucide-react";
import type { Role, Session } from "@/lib/session";

const NAV: Record<Role, { href: string; label: string }[]> = {
  submitter: [
    { href: "/submit", label: "New submission" },
    { href: "/submissions", label: "My submissions" },
    { href: "/rules", label: "Rules" },
  ],
  reviewer: [
    { href: "/reviewer", label: "Review queue" },
    { href: "/reviewer/exports", label: "Exports" },
    { href: "/analytics", label: "Analytics" },
    { href: "/rules", label: "Rules" },
  ],
};

export function AppHeader({ session }: { session: Session | null }) {
  if (!session) return null;

  const isReviewer = session.role === "reviewer";
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand" href={isReviewer ? "/reviewer" : "/submissions"}>
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-name">
            clearpath<span className="brand-dot">.</span>
          </span>
          <span className="brand-divider" />
          <span className="brand-product">Marketing compliance</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV[session.role].map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="profile-area">
          <div className="profile-copy">
            <span className="profile-name">{session.actor.split(" (")[0]}</span>
            <span className="role-pill">
              {isReviewer ? <ShieldCheck size={12} /> : <CircleCheck size={12} />}
              {isReviewer ? "Compliance" : "Marketing"}
            </span>
          </div>
          <Link className="switch-role" href="/" aria-label="Switch demo role">
            <Command size={15} />
            <span>Switch role</span>
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PageFooter() {
  return (
    <footer className="page-footer">
      <span>Rules are inspired by UDAAP, Reg Z, and FTC Endorsement Guides principles.</span>
      <span>Illustrative, not legal advice.</span>
      <Link href="/rules">View compliance rules</Link>
    </footer>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <main className="page-container">{children}</main>;
}
