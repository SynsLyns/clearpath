"use client";

import { useEffect, useState } from "react";
import { formatDate, formatDuration, getRelativeTime } from "@/lib/format";

export function TimeAgo({ date }: { date: Date | string }) {
  const iso = new Date(date).toISOString();
  const [label, setLabel] = useState("recently");

  useEffect(() => {
    const update = () => setLabel(getRelativeTime(iso));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, [iso]);

  return <time dateTime={iso} title={formatDate(iso)}>{label}</time>;
}

export function WaitingTime({ date }: { date: Date | string }) {
  const iso = new Date(date).toISOString();
  const [label, setLabel] = useState("recently");

  useEffect(() => {
    const update = () => setLabel(formatDuration(Date.now() - new Date(iso).getTime()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, [iso]);

  return <>{label}</>;
}
