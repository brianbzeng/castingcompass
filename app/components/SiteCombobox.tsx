"use client";

import { KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import type { FishingSite } from "../types";

interface SiteComboboxProps {
  sites: FishingSite[];
  value: string;
  onChange(siteId: string): void;
  label?: string;
  placeholder?: string;
  className?: string;
}

const MAX_RESULTS = 8;

export function SiteCombobox({
  sites,
  value,
  onChange,
  label = "Fishing location",
  placeholder = "Search a pier, beach, city, or shoreline…",
  className = "",
}: SiteComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSite = useMemo(() => sites.find((site) => site.id === value), [sites, value]);
  const [query, setQuery] = useState(selectedSite?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sites
      .filter((site) => !normalized || `${site.name} ${site.region} ${site.type}`.toLowerCase().includes(normalized))
      .slice(0, MAX_RESULTS);
  }, [query, sites]);

  const choose = (site: FishingSite) => {
    onChange(site.id);
    setQuery(site.name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(results.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(0, current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`site-combobox ${className}`.trim()}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className="site-combobox-control">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={open ? query : selectedSite?.name ?? query}
          onFocus={() => {
            setQuery(selectedSite?.name ?? query);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const exact = sites.find((site) => site.name.toLowerCase() === nextQuery.trim().toLowerCase());
            setQuery(nextQuery);
            setOpen(true);
            setActiveIndex(0);
            onChange(exact?.id ?? "");
          }}
          onKeyDown={handleKeyDown}
        />
        <span aria-hidden="true">⌄</span>
      </div>
      {open ? (
        <div id={listId} className="site-combobox-results" role="listbox" aria-label="Matching fishing locations">
          {results.length ? results.map((site, index) => (
            <button
              id={`${listId}-${index}`}
              key={site.id}
              type="button"
              role="option"
              aria-selected={site.id === value}
              className={index === activeIndex ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(site)}
            >
              <strong>{site.name}</strong>
              <small>{site.region} · {site.type}</small>
            </button>
          )) : <p>No matching fishing locations.</p>}
        </div>
      ) : null}
      <small className="site-combobox-status">
        {value && selectedSite ? `Selected: ${selectedSite.name}` : open ? `${results.length}${sites.length > MAX_RESULTS && results.length === MAX_RESULTS ? "+" : ""} matching locations` : "Type to find a location"}
      </small>
    </div>
  );
}
