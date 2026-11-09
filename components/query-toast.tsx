"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

export function QueryToast({
  message,
  clearKey,
}: {
  message?: string;
  clearKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      const params = new URLSearchParams(window.location.search);
      if (clearKey) params.delete(clearKey);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [clearKey, message, pathname, router]);

  if (!visible || !message) return null;
  return (
    <div className="toast-message" role="status">
      <CheckCircle2 size={18} />
      <span>{message}</span>
      <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss notification">
        <X size={16} />
      </button>
    </div>
  );
}
