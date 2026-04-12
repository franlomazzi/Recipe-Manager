"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Package } from "lucide-react";
import type { LibraryIngredient } from "@/lib/types/recipe";

interface IngredientComboboxProps {
  value: string;
  libraryItems: LibraryIngredient[];
  onSelectLibraryItem: (item: LibraryIngredient) => void;
  onNameChange: (name: string) => void;
  className?: string;
}

export function IngredientCombobox({
  value,
  libraryItems,
  onSelectLibraryItem,
  onNameChange,
  className,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function handleInputChange(val: string) {
    setSearch(val);
    onNameChange(val);
    if (!open) setOpen(true);
  }

  function handleSelect(item: LibraryIngredient) {
    setSearch(item.name);
    onSelectLibraryItem(item);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    // Don't close if clicking within the dropdown
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
  }

  function handleFocus() {
    if (search.trim()) setOpen(true);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search or type ingredient..."
          value={search}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="pl-7"
        />
      </div>

      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
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
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left border-t border-border text-primary transition-colors"
              onClick={() => {
                onNameChange(search.trim());
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Add &quot;{search.trim()}&quot; as new ingredient</span>
            </button>
          )}

          {displayItems.length === 0 && exactMatch && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No more results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
