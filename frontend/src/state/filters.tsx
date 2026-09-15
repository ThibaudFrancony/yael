import React, { createContext, useContext, useMemo, useState } from "react";

export type Filters = {
  categories: string[];
  interests: string[];
  availableNow: boolean;
  smallGroups: boolean;
  maxDistance: number; // km
};

const DEFAULT: Filters = {
  categories: [],
  interests: [],
  availableNow: false,
  smallGroups: false,
  maxDistance: 30,
};

type Ctx = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  reset: () => void;
  activeCount: number;
};

const FiltersContext = createContext<Ctx | undefined>(undefined);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const activeCount =
    filters.categories.length +
    filters.interests.length +
    (filters.availableNow ? 1 : 0) +
    (filters.smallGroups ? 1 : 0) +
    (filters.maxDistance < 30 ? 1 : 0);
  const value = useMemo(
    () => ({ filters, setFilters, reset: () => setFilters(DEFAULT), activeCount }),
    [filters, activeCount]
  );
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}

export function buildMealQuery(filters: Filters, search: string): string {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (filters.categories.length) params.set("categories", filters.categories.join(","));
  if (filters.interests.length) params.set("interests", filters.interests.join(","));
  if (filters.availableNow) params.set("available_now", "true");
  if (filters.smallGroups) params.set("small_groups", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
