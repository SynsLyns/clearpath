"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClearFilters } from "@/components/clear-filters";
import { PRODUCTS, STATUSES, STATUS_LABELS } from "@/lib/constants";
import { titleCase } from "@/lib/format";

export function SubmissionFilters({
  initialSearch,
  initialProduct,
  initialStatus,
  hasFilters,
  clearAction = "/submissions",
  includeArchived = false,
}: {
  initialSearch: string;
  initialProduct: string;
  initialStatus: string;
  hasFilters: boolean;
  clearAction?: string;
  includeArchived?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [product, setProduct] = useState(initialProduct);
  const [status, setStatus] = useState(initialStatus);
  const query = searchParams.toString();
  const statuses = includeArchived ? STATUSES : STATUSES.filter((value) => value !== "archived");

  useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("search") ?? "");
      setProduct(params.get("product") ?? "");
      setStatus(params.get("status") ?? "");
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const currentSearch = params.get("search") ?? "";
    const currentProduct = params.get("product") ?? "";
    const currentStatus = params.get("status") ?? "";
    if (
      search === currentSearch &&
      product === currentProduct &&
      status === currentStatus
    ) return;

    const filterSelectionChanged =
      product !== currentProduct || status !== currentStatus;
    const timer = window.setTimeout(() => {
      if (search) params.set("search", search);
      else params.delete("search");
      if (product) params.set("product", product);
      else params.delete("product");
      if (status) params.set("status", status);
      else params.delete("status");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }, search !== currentSearch && !filterSelectionChanged ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [pathname, product, query, router, search, status]);

  return (
    <div className="submission-filters" role="search" aria-label="Filter submissions">
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
        <select
          name="product"
          value={product}
          onChange={(event) => setProduct(event.currentTarget.value)}
        >
          <option value="">All products</option>
          {PRODUCTS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
      </label>
      <label className="submission-filter-select">
        <span className="sr-only">Filter by status</span>
        <select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
        </select>
      </label>
      {hasFilters && <ClearFilters action={clearAction} />}
    </div>
  );
}
