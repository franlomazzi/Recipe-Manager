"use client";

import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronRight, PiggyBank } from "lucide-react";

export function GroceryCostLink() {
  return (
    <Link href="/grocery-costs" className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" />
              Grocery Costs
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardDescription>
            Track ingredient prices, compare stores, and swap to the cheapest to
            see what you save.
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
