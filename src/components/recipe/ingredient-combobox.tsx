"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Search, Plus, Package, CheckCircle2 } from "lucide-react";
import type { LibraryIngredient } from "@/lib/types/recipe";

interface IngredientComboboxProps {
  value: string;
  libraryItems: LibraryIngredient[];
  onSelectLibraryItem: (item: LibraryIngredient) => void;
  onNameChange: (name: string) => void;
  onConfirmNew?: () => void;
  isConfirmedNew?: boolean;
  className?: string;
}

export function IngredientCombobox({
  value,
  libraryItems,
  onSelectLibraryItem,
  onNameChange,
  onConfirmNew,
  isConfirmedNew,
  className,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Sync external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  const filtered = search.trim()
    ? libraryItems.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      )
    : libraryItems;

  // Only show dropdown when typing, limit to 8 results
  const showDropdown = open && search.trim().length > 0;
  const displayItems = filtered.slice(0, 8);
  const exactMatch = libraryItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase()
  );

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    setPos({
      top: rect.bottom + 4 + window.scrollY,
      left: Math.min(rect.left + window.scrollX, maxLeft + window.scrollX),
      width: rect.width,
    });
  }, []);

  function handleInputChange(val: string) {
    setSearch(val);
    onNameChange(val);
    if (!open) {
      updatePosition();
      setOpen(true);
    }
  }

  function handleSelect(item: LibraryIngredient) {
    setSearch(item.name);
    onSelectLibraryItem(item);
    setOpen(false);
  }

  function handleFocus() {
    if (search.trim()) {
      updatePosition();
      setOpen(true);
    }
  }

  // Close when clicking outside both the input wrapper and the portal dropdown.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showDropdown]);

  // Reposition on scroll / resize while open.
  useEffect(() => {
    if (!showDropdown) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown, updatePosition]);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search or type ingredient..."
          value={search}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          className="pl-7"
        />
      </div>

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }}
            className="z-50 rounded-md border border-border bg-popover shadow-md ring-1 ring-foreground/10 max-h-52 overflow-y-auto"
          >
            {displayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                onClick={() => handleSelect(item)}
              >
                <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{item.name}</span>
              </button>
            ))}

            {!exactMatch && search.trim() && (
              isConfirmedNew ? (
                <div className="flex w-full items-center gap-2 px-3 py-2 text-sm border-t border-border text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Already added as new ingredient</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left border-t border-border text-primary transition-colors"
                  onClick={() => {
                    onNameChange(search.trim());
                    onConfirmNew?.();
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">&quot;{search.trim()}&quot; as new ingredient</span>
                </button>
              )
            )}

            {displayItems.length === 0 && exactMatch && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No more results
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
