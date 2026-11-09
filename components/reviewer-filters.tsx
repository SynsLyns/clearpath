"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClearFilters } from "@/components/clear-filters";
import { CHANNELS, PRODUCTS } from "@/lib/constants";
import { titleCase } from "@/lib/format";

const RISKS = ["high", "medium", "clean"] as const;
const QA_FILTERS = ["sample", "standard"] as const;

export function ReviewerFilters({
  initialSearch,
  initialProduct,
  initialChannel,
  initialRisk,
  initialQa,
  hasFilters,
  counts,
}: {
  initialSearch: string;
  initialProduct: string;
  initialChannel: string;
  initialRisk: string;
  initialQa: string;
  hasFilters: boolean;
  counts: {
    products: Record<string, number>;
    channels: Record<string, number>;
    risks: Record<string, number>;
    qa: Record<string, number>;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [product, setProduct] = useState(initialProduct);
  const [channel, setChannel] = useState(initialChannel);
  const [risk, setRisk] = useState(initialRisk);
  const [qa, setQa] = useState(initialQa);
  const query = searchParams.toString();

  useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("search") ?? "");
      setProduct(params.get("product") ?? "");
      setChannel(params.get("channel") ?? "");
      setRisk(params.get("risk") ?? "");
      setQa(params.get("qa") ?? "");
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const currentSearch = params.get("search") ?? "";
    const currentProduct = params.get("product") ?? "";
    const currentChannel = params.get("channel") ?? "";
    const currentRisk = params.get("risk") ?? "";
    const currentQa = params.get("qa") ?? "";
    if (
      search === currentSearch &&
      product === currentProduct &&
      channel === currentChannel &&
      risk === currentRisk &&
      qa === currentQa
    ) return;

    const filterSelectionChanged =
      product !== currentProduct ||
      channel !== currentChannel ||
      risk !== currentRisk ||
      qa !== currentQa;
    const timer = window.setTimeout(() => {
      if (search) params.set("search", search);
      else params.delete("search");
      if (product) params.set("product", product);
      else params.delete("product");
      if (channel) params.set("channel", channel);
      else params.delete("channel");
      if (risk) params.set("risk", risk);
      else params.delete("risk");
      if (qa) params.set("qa", qa);
      else params.delete("qa");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }, search !== currentSearch && !filterSelectionChanged ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [channel, pathname, product, query, qa, risk, router, search]);

  return (
    <div className="submission-filters reviewer-filters" role="search" aria-label="Filter review queue">
      <label className="submission-search">
        <span className="sr-only">Search partner or campaign</span>
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          name="search"
          placeholder="Search partner or campaign"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </label>
      <label className="submission-filter-select">
        <span className="sr-only">Filter by product</span>
        <select name="product" value={product} onChange={(event) => setProduct(event.currentTarget.value)}>
          <option value="">All products</option>
          {PRODUCTS.map((value) => <option key={value} value={value}>{titleCase(value)} ({counts.products[value] ?? 0})</option>)}
        </select>
      </label>
      <label className="submission-filter-select">
        <span className="sr-only">Filter by channel</span>
        <select name="channel" value={channel} onChange={(event) => setChannel(event.currentTarget.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((value) => <option key={value} value={value}>{titleCase(value)} ({counts.channels[value] ?? 0})</option>)}
        </select>
      </label>
      <label className="submission-filter-select">
        <span className="sr-only">Filter by risk</span>
        <select name="risk" value={risk} onChange={(event) => setRisk(event.currentTarget.value)}>
          <option value="">All risk levels</option>
          {RISKS.map((value) => <option key={value} value={value}>{value === "clean" ? "Clean" : `${titleCase(value)} risk`} ({counts.risks[value] ?? 0})</option>)}
        </select>
      </label>
      <label className="submission-filter-select">
        <span className="sr-only">Filter by QA sample</span>
        <select name="qa" value={qa} onChange={(event) => setQa(event.currentTarget.value)}>
          <option value="">All review types</option>
          {QA_FILTERS.map((value) => <option key={value} value={value}>{value === "sample" ? "QA samples" : "Standard review"} ({counts.qa[value] ?? 0})</option>)}
        </select>
      </label>
      {hasFilters && <ClearFilters action="/reviewer" />}
    </div>
  );
}
