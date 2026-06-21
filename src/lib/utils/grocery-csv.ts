import type { LibraryIngredient, PriceEntry } from "@/lib/types/recipe";
import { activeEntry, effectiveEntries, perUnit } from "./grocery-cost";

const COLUMNS = [
  "Ingredient",
  "Brand",
  "Category",
  "Pantry item",
  "Location",
  "Price",
  "Quantity",
  "Unit",
  "Price per unit",
  "Min. to buy",
  "Active price",
  "Date recorded",
] as const;

/** Wrap a value in quotes when it contains a comma, quote, or newline. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Trim a float to at most 4 decimals without trailing zeros; "" for null. */
function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

export interface CsvLabels {
  /** Human label for an entry's location. */
  locationLabel: (entry: PriceEntry) => string;
  /** Human label for an ingredient's category ("" when none). */
  categoryLabel: (item: LibraryIngredient) => string;
}

/**
 * Build a CSV of every library ingredient and its recorded prices — one row per
 * price entry, plus a single blank-price row for ingredients with no price yet.
 * Numbers are raw (no currency symbol) so the file is ready for spreadsheet work.
 */
export function buildGroceryCsv(
  items: LibraryIngredient[],
  { locationLabel, categoryLabel }: CsvLabels
): string {
  const rows: string[] = [COLUMNS.map(csvCell).join(",")];

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  for (const item of sorted) {
    const entries = effectiveEntries(item);
    const active = activeEntry(item);
    const base = {
      name: item.name,
      brand: item.brand ?? "",
      category: categoryLabel(item),
      pantry: item.isPantryItem ? "Yes" : "No",
    };

    if (entries.length === 0) {
      rows.push(
        [
          base.name,
          base.brand,
          base.category,
          base.pantry,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]
          .map(csvCell)
          .join(",")
      );
      continue;
    }

    const sortedEntries = [...entries].sort((a, b) => perUnit(a) - perUnit(b));
    for (const entry of sortedEntries) {
      rows.push(
        [
          base.name,
          base.brand,
          base.category,
          base.pantry,
          locationLabel(entry),
          num(entry.price),
          num(entry.qty),
          entry.unit,
          num(perUnit(entry)),
          num(entry.minQty),
          active?.id === entry.id ? "Yes" : "No",
          entry.addedAt
            ? new Date(entry.addedAt).toISOString().slice(0, 10)
            : "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  return rows.join("\r\n");
}
