"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, RotateCcw, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { useHouseholdPantryState } from "@/lib/hooks/use-household-pantry-state";
import {
  setPantryWeekSettlement,
  clearPantryWeekSettlement,
  removePantryPurchase,
} from "@/lib/firebase/household-pantry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PantryPurchase } from "@/lib/types/household";

interface WeekSummary {
  weekKey: string;
  purchases: Array<{ key: string; purchase: PantryPurchase }>;
  myTotal: number;
  partnerTotal: number;
  /** Positive: partner owes me. Negative: I owe partner. */
  rawNet: number;
  /** Net adjusted for any prior settlement. */
  pendingNet: number;
  settledAmount: number;
  settledAt: Date | null;
  settledFromMe: boolean;
}

function formatWeekLabel(weekKey: string): string {
  // ISO week key is "YYYY-Www" (e.g. "2026-W19"). Compute the Monday for display.
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekKey;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // Jan 4 is always in ISO week 1; back up to its Monday, then add weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return `${format(monday, "MMM d")} – ${format(sunday, "MMM d, yyyy")}`;
}

export default function CostBalancePage() {
  const { user } = useAuth();
  const { household, householdId, partnerUid, partnerName, loading: hhLoading } = useHousehold();
  const { state, loading: pantryLoading } = useHouseholdPantryState();
  const [busyWeek, setBusyWeek] = useState<string | null>(null);

  const myName = user?.displayName ?? "You";
  const partnerLabel = partnerName ?? "Partner";

  const weeks = useMemo<WeekSummary[]>(() => {
    if (!user || !partnerUid) return [];
    const purchasesByWeek = state.pantryPurchasesByWeek ?? {};
    const settlementsByWeek = state.pantrySettlementsByWeek ?? {};
    const weekKeys = new Set<string>([
      ...Object.keys(purchasesByWeek),
      ...Object.keys(settlementsByWeek),
    ]);
    const summaries: WeekSummary[] = [];
    for (const weekKey of weekKeys) {
      const weekPurchases = purchasesByWeek[weekKey] ?? {};
      const entries = Object.entries(weekPurchases).map(([key, purchase]) => ({
        key,
        purchase,
      }));
      let myTotal = 0;
      let partnerTotal = 0;
      for (const { purchase } of entries) {
        if (purchase.uid === user.uid) myTotal += purchase.cost;
        else if (purchase.uid === partnerUid) partnerTotal += purchase.cost;
      }
      const rawNet = (myTotal - partnerTotal) / 2;
      const settlement = settlementsByWeek[weekKey];
      let settledSigned = 0;
      let settledFromMe = false;
      if (settlement) {
        // Positive when partner paid me (reduces partner's debt to me).
        if (settlement.toUid === user.uid) settledSigned = settlement.amount;
        else if (settlement.fromUid === user.uid) {
          settledSigned = -settlement.amount;
          settledFromMe = true;
        }
      }
      summaries.push({
        weekKey,
        purchases: entries.sort((a, b) => a.purchase.name.localeCompare(b.purchase.name)),
        myTotal,
        partnerTotal,
        rawNet,
        pendingNet: rawNet - settledSigned,
        settledAmount: settlement?.amount ?? 0,
        settledAt: settlement?.settledAt?.toDate?.() ?? null,
        settledFromMe,
      });
    }
    // Most recent week first by ISO key (YYYY-Www sorts lexicographically).
    return summaries.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  }, [state, user, partnerUid]);

  async function handleSettle(week: WeekSummary) {
    if (!householdId || !user || !partnerUid) return;
    const amount = Math.abs(week.pendingNet);
    if (amount < 0.005) return;
    // pendingNet > 0  ⇒ partner owes me  ⇒ partner pays me
    // pendingNet < 0  ⇒ I owe partner    ⇒ I pay partner
    const fromUid = week.pendingNet > 0 ? partnerUid : user.uid;
    const toUid = week.pendingNet > 0 ? user.uid : partnerUid;
    setBusyWeek(week.weekKey);
    try {
      await setPantryWeekSettlement(householdId, week.weekKey, fromUid, toUid, amount);
    } finally {
      setBusyWeek(null);
    }
  }

  async function handleRemovePurchase(
    week: WeekSummary,
    key: string,
    name: string
  ) {
    if (!householdId) return;
    if (
      !window.confirm(
        `Remove "${name}" from this week's cost balance? It stays ticked on the shopping list but won't count toward what you owe each other.`
      )
    )
      return;
    setBusyWeek(week.weekKey);
    try {
      await removePantryPurchase(householdId, week.weekKey, key);
    } finally {
      setBusyWeek(null);
    }
  }

  async function handleUnsettle(week: WeekSummary) {
    if (!householdId) return;
    setBusyWeek(week.weekKey);
    try {
      await clearPantryWeekSettlement(householdId, week.weekKey);
    } finally {
      setBusyWeek(null);
    }
  }

  if (hhLoading || pantryLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!household || !partnerUid) {
    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Cost balance only applies when you share a household. Invite a
            partner from Settings → Household to start splitting shared
            pantry costs.
          </CardContent>
        </Card>
      </div>
    );
  }

  const grandPending = weeks.reduce((sum, w) => sum + w.pendingNet, 0);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5">
      <BackLink />
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Cost balance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Splits shared pantry purchases 50/50 with {partnerLabel}. Each week
          settles independently.
        </p>
      </div>

      {weeks.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Net across all weeks
            </p>
            <p className="text-lg font-semibold mt-0.5">
              {Math.abs(grandPending) < 0.005 ? (
                <span className="text-muted-foreground">All settled</span>
              ) : grandPending > 0 ? (
                <>
                  {partnerLabel} owes you{" "}
                  <span className="text-primary">${grandPending.toFixed(2)}</span>
                </>
              ) : (
                <>
                  You owe {partnerLabel}{" "}
                  <span className="text-primary">${Math.abs(grandPending).toFixed(2)}</span>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {weeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No shared pantry purchases yet. Tick off household pantry items on
            the shopping list to start tracking.
          </CardContent>
        </Card>
      ) : (
        weeks.map((week) => {
          const isSettled = !!week.settledAt;
          const fullySettled = isSettled && Math.abs(week.pendingNet) < 0.005;
          const busy = busyWeek === week.weekKey;
          return (
            <Card key={week.weekKey}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {formatWeekLabel(week.weekKey)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {week.weekKey}
                    </p>
                  </div>
                  {fullySettled && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Settled
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Per-person totals */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{myName}</p>
                    <p className="font-semibold">${week.myTotal.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{partnerLabel}</p>
                    <p className="font-semibold">${week.partnerTotal.toFixed(2)}</p>
                  </div>
                </div>

                {/* Item breakdown */}
                {week.purchases.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                      {week.purchases.length} item
                      {week.purchases.length === 1 ? "" : "s"} ·{" "}
                      <span className="underline">show details</span>
                    </summary>
                    <ul className="mt-2 divide-y rounded-md border">
                      {week.purchases.map(({ key, purchase }) => (
                        <li
                          key={key}
                          className="flex items-center justify-between px-3 py-1.5 text-sm"
                        >
                          <span className="flex-1 truncate">{purchase.name}</span>
                          <span className="text-xs text-muted-foreground mr-3">
                            {purchase.uid === user?.uid ? myName : partnerLabel}
                          </span>
                          <span className="font-mono tabular-nums">
                            ${purchase.cost.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${purchase.name} from cost balance`}
                            title="Remove from cost balance"
                            onClick={() =>
                              handleRemovePurchase(week, key, purchase.name)
                            }
                            disabled={busy}
                            className="ml-2 -mr-1 rounded p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Settlement summary */}
                {isSettled && (
                  <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                    {week.settledFromMe ? (
                      <>You paid {partnerLabel} ${week.settledAmount.toFixed(2)}</>
                    ) : (
                      <>{partnerLabel} paid you ${week.settledAmount.toFixed(2)}</>
                    )}
                    {week.settledAt && (
                      <> · {format(week.settledAt, "MMM d, yyyy")}</>
                    )}
                  </div>
                )}

                {/* Action row */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-sm">
                    {Math.abs(week.pendingNet) < 0.005 ? (
                      <span className="text-muted-foreground">Even</span>
                    ) : week.pendingNet > 0 ? (
                      <>
                        {partnerLabel} owes you{" "}
                        <span className="font-semibold text-primary">
                          ${week.pendingNet.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <>
                        You owe {partnerLabel}{" "}
                        <span className="font-semibold text-primary">
                          ${Math.abs(week.pendingNet).toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isSettled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnsettle(week)}
                        disabled={busy}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Undo
                      </Button>
                    )}
                    {Math.abs(week.pendingNet) >= 0.005 && (
                      <Button
                        size="sm"
                        onClick={() => handleSettle(week)}
                        disabled={busy}
                      >
                        Mark settled
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/shopping-list"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to shopping list
    </Link>
  );
}
