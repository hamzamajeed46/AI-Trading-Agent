"use client";

import type { CountryCode } from "libphonenumber-js";
import { useId, useRef, useState } from "react";
import { COUNTRIES, findCountry, type Country } from "@/lib/countries";
import styles from "./CountrySelect.module.css";

type CountrySelectProps = {
  id?: string;
  value: CountryCode | "";
  onChange: (country: Country) => void;
  required?: boolean;
};

export default function CountrySelect({ id, value, onChange, required }: CountrySelectProps) {
  const selected = value ? findCountry(value) : undefined;
  // `query` only matters while the listbox is open (it's the in-progress
  // search text); while closed, the input just displays the selection name,
  // computed at render time -- no effect needed to keep it "in sync."
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered =
    query.trim() === ""
      ? COUNTRIES
      : COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  function commit(country: Country) {
    onChange(country);
    setOpen(false);
  }

  function openAt(index: number) {
    setQuery("");
    setOpen(true);
    setActiveIndex(index);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function handleFocus() {
    const startIndex = selected ? COUNTRIES.findIndex((c) => c.code === selected.code) : 0;
    openAt(Math.max(startIndex, 0));
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      close();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        const startIndex = selected ? COUNTRIES.findIndex((c) => c.code === selected.code) : 0;
        openAt(Math.max(startIndex, 0));
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const country = filtered[activeIndex];
      if (country) commit(country);
    } else if (e.key === "Escape") {
      close();
    }
  }

  const activeOption = filtered[activeIndex];
  const displayValue = open ? query : selected?.name ?? "";

  return (
    <div className={styles.wrap} ref={containerRef} onBlur={handleBlur}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeOption ? `${listboxId}-${activeOption.code}` : undefined}
        required={required}
        autoComplete="off"
        placeholder="Search countries..."
        value={displayValue}
        onFocus={handleFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className={styles.listbox} role="listbox" id={listboxId}>
          {filtered.length === 0 ? (
            <li className={styles.empty}>No matches</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.code}
                id={`${listboxId}-${c.code}`}
                role="option"
                aria-selected={c.code === value}
                className={`${styles.option} ${i === activeIndex ? styles.optionActive : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(c)}
              >
                <span>{c.name}</span>
                <span className={`${styles.dialCode} mono`}>+{c.callingCode}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
