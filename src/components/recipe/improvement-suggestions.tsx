"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, X, Star, Edit } from "lucide-react";
import type { CookLog } from "@/lib/types/recipe";

interface ImprovementSuggestionsProps {
  cookLogs: CookLog[];
  recipeId: string;
  variant?: "card" | "compact";
}

export function ImprovementSuggestions({
  cookLogs,
  recipeId,
  variant = "card",
}: ImprovementSuggestionsProps) {
  const [dismissed, setDismissed] = useState(false);

  const unapplied = cookLogs.filter(
    (log) => log.improvements?.trim() && log.appliedToVersion === null
  );

  if (dismissed || unapplied.length === 0) return null;

  if (variant === "compact") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lightbulb className="h-4 w-4 text-primary" />
            Past Improvements to Consider
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <ul className="space-y-1.5">
          {unapplied.map((log) => (
            <li key={log.id} className="text-sm text-muted-foreground pl-6">
              &bull; {log.improvements}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Improvements from Past Cooks
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 -mr-2"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {unapplied.length} unapplied suggestion{unapplied.length !== 1 ? "s" : ""} from your cook logs
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {unapplied.map((log) => (
          <div
            key={log.id}
            className="rounded-md bg-background/80 p-3 space-y-1"
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < log.rating
                        ? "fill-primary text-primary"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {log.cookedAt?.toDate?.()
                  ? log.cookedAt.toDate().toLocaleDateString()
                  : ""}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                v{log.version}
              </Badge>
            </div>
            <p className="text-sm">{log.improvements}</p>
            {log.notes && (
              <p className="text-xs text-muted-foreground italic">
                Note: {log.notes}
              </p>
            )}
          </div>
        ))}
        <Button
          size="sm"
          className="w-full"
          render={<Link href={`/recipes/${recipeId}/edit?applyImprovements=true`} />}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit Recipe with Improvements
        </Button>
      </CardContent>
    </Card>
  );
}
