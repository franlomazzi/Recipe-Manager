"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { ChevronDown, Plus } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  getUnitOptions,
  isCanonicalUnit,
  addAuthorizedUnit,
  UNIT_LABELS,
} from "@/lib/unit-standards";

interface UnitComboboxProps {
  value: string;
  onValueChange: (unit: string) => void;
  className?: string;
  /**
   * When set, the combobox renders as a read-only pill showing only this
   * unit. Used for ingredients linked to a library entry — scaling macros
   * only makes sense against the library's reference unit, so the choice
   * is taken away on purpose.
   */
  lockedUnit?: string;
}

export function UnitCombobox({
  value,
  onValueChange,
  className,
  lockedUnit,
}: UnitComboboxProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Build the option list each render so user-added units show up immediately.
  const allOptions = getUnitOptions();

  // If the current value is a legacy (non-canonical) unit, append it so it
  // still appears in the list and can be re-selected.
  const hasLegacy = value && !isCanonicalUnit(value);
  const options = hasLegacy
    ? [...allOptions, { value, label: `${value} (legacy)` }]
    : allOptions;

  // Filter by search text — match against both value and label.
  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.value.toLowerCase().includes(search.toLowerCase()) ||
          o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const exactMatch = allOptions.some(
    (o) => o.value === search.trim().toLowerCase()
  );
  const showAddNew = search.trim().length > 0 && !exactMatch;

  // Display label for the current value.
  const displayLabel =
    UNIT_LABELS[value] ??
    allOptions.find((o) => o.value === value)?.label ??
    (value || "");

  // Position the portal dropdown below the trigger button.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4 + window.scrollY,
      left: rect.left + window.scrollX,
    });
  }, []);

  function handleInputChange(val: string) {
    setSearch(val);
    if (!open) setOpen(true);
  }

  function handleSelect(unitValue: string) {
    onValueChange(unitValue);
    setSearch("");
    setOpen(false);
  }

  async function handleAddUnit() {
    if (!user || !search.trim()) return;
    const normalized = search.trim().toLowerCase();
    try {
      await addAuthorizedUnit(user.uid, normalized);
      onValueChange(normalized);
      setSearch("");
      setOpen(false);
    } catch (err) {
      console.error("Failed to add unit:", err);
    }
  }

  function handleTriggerClick() {
    if (!open) {
      updatePosition();
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setOpen(false);
    }
  }

  // Close when clicking outside both the trigger and the portal dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setSearch("");
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearch("");
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reposition on scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  if (lockedUnit) {
    const lockedLabel = UNIT_LABELS[lockedUnit] ?? lockedUnit;
    return (
      <div
        className={`flex h-8 w-full items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground select-none ${className ?? ""}`}
        title={`Locked to the library ingredient's reference unit (${lockedUnit}). Unlink by renaming the ingredient.`}
      >
        <span className="truncate">{lockedLabel}</span>
      </div>
    );
  }

  return (
    <div className={className ?? ""}>
      {/* Trigger — styled to match the existing SelectTrigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none h-8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span
          className={`truncate text-left ${
            !value ? "text-muted-foreground" : ""
          }`}
        >
          {value ? displayLabel : "Unit"}
        </span>
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown rendered via portal to escape overflow:hidden parents */}
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "absolute", top: dropdownPos.top, left: dropdownPos.left }}
            className="z-50 w-56 rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10"
          >
            {/* Search input */}
            <div className="p-1.5">
              <Input
                ref={inputRef}
                placeholder="Search or type new unit..."
                value={search}
                onChange={(e) => handleInputChange(e.target.value)}
                className="h-7 text-sm"
                autoFocus
              />
            </div>

            {/* Options list */}
            <div className="max-h-52 overflow-y-auto px-1 pb-1">
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                    o.value === value ? "bg-accent/50 font-medium" : ""
                  }`}
                  onClick={() => handleSelect(o.value)}
                >
                  {o.label}
                </button>
              ))}

              {filtered.length === 0 && !showAddNew && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No matching units
                </div>
              )}

              {showAddNew && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-primary transition-colors hover:bg-accent border-t border-border mt-1 pt-1.5"
                  onClick={handleAddUnit}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Add &quot;{search.trim().toLowerCase()}&quot; as new unit
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
