"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CHANNELS, PRODUCTS } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import type { Severity } from "@/lib/rules";

export function RulesFilters({
  initialSearch,
  initialProduct,
  initialChannel,
  initialSeverity,
}: {
  initialSearch: string;
  initialProduct: string;
  initialChannel: string;
  initialSeverity: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [product, setProduct] = useState(initialProduct);
  const [channel, setChannel] = useState(initialChannel);
  const [severity, setSeverity] = useState(initialSeverity);
  const query = searchParams.toString();

  useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("q") ?? "");
      setProduct(params.get("product") ?? "all");
      setChannel(params.get("channel") ?? "all");
      setSeverity(params.get("severity") ?? "all");
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const currentSearch = params.get("q") ?? "";
    const currentProduct = params.get("product") ?? "all";
    const currentChannel = params.get("channel") ?? "all";
    const currentSeverity = params.get("severity") ?? "all";
    if (
      search === currentSearch &&
      product === currentProduct &&
      channel === currentChannel &&
      severity === currentSeverity
    ) return;

    const filterSelectionChanged =
      product !== currentProduct ||
      channel !== currentChannel ||
      severity !== currentSeverity;
    const timer = window.setTimeout(() => {
      if (search) params.set("q", search);
      else params.delete("q");
      if (product !== "all") params.set("product", product);
      else params.delete("product");
      if (channel !== "all") params.set("channel", channel);
      else params.delete("channel");
      if (severity !== "all") params.set("severity", severity);
      else params.delete("severity");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }, search !== currentSearch && !filterSelectionChanged ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [channel, pathname, product, query, router, search, severity]);

  return (
    <div className="rules-filter-form" role="search" aria-label="Filter rules">
      <label className="field">
        <span>Search rules</span>
        <div className="rules-search-input">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            name="q"
            value={search}
            placeholder="Search title, authority, or guidance"
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
      </label>
      <label className="field">
        <span>Product</span>
        <select name="product" value={product} onChange={(event) => setProduct(event.currentTarget.value)}>
          <option value="all">All products</option>
          {PRODUCTS.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Channel</span>
        <select name="channel" value={channel} onChange={(event) => setChannel(event.currentTarget.value)}>
          <option value="all">All channels</option>
          {CHANNELS.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Severity</span>
        <select
          name="severity"
          value={severity}
          onChange={(event) => setSeverity(event.currentTarget.value as Severity | "all")}
        >
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
      </label>
      <a className="button button-outline" href="/rules">Clear filters</a>
    </div>
  );
}
