import { STATUS_LABELS, STATUSES, type SubmissionStatus } from "./constants";

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDuration(milliseconds: number): string {
  const hours = Math.max(0, Math.floor(milliseconds / 3_600_000));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days) return `${days}d ${remainingHours}h`;
  if (hours) return `${hours}h`;
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
  return `${minutes}m`;
}

export function statusClass(status: SubmissionStatus | string): string {
  return `status status-${status}`;
}

export function statusLabel(status: string): string {
  return (STATUSES as readonly string[]).includes(status)
    ? STATUS_LABELS[status as SubmissionStatus]
    : titleCase(status);
}

export function riskClass(risk: "high" | "medium" | "clean"): string {
  return `risk risk-${risk}`;
}

export function getRelativeTime(date: Date | string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(date).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
