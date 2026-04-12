"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { startPlanInstance } from "@/lib/firebase/meal-plans";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";
import type { PlanTemplate } from "@/lib/types/meal-plan";

interface StartPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PlanTemplate;
  onStarted?: () => void;
}

export function StartPlanDialog({
  open,
  onOpenChange,
  template,
  onStarted,
}: StartPlanDialogProps) {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startWeek, setStartWeek] = useState("0");
  const [starting, setStarting] = useState(false);

  const remainingWeeks = template.weeks.length - parseInt(startWeek);
  const endDate = addDays(
    parseISO(startDate),
    remainingWeeks * 7 - 1
  );

  async function handleStart() {
    if (!user) return;
    setStarting(true);
    try {
      await startPlanInstance(
        user.uid,
        template,
        startDate,
        parseInt(startWeek)
      );
      toast.success("Plan started!");
      onStarted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to start plan");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start &quot;{template.name}&quot;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {template.weeks.length > 1 && (
            <div className="space-y-1.5">
              <Label>Start from week</Label>
              <Select value={startWeek} onValueChange={(v) => v && setStartWeek(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {template.weeks.map((_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      Week {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span>{remainingWeeks} week{remainingWeeks > 1 ? "s" : ""}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End date</span>
              <span>{format(endDate, "MMM d, yyyy")}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={starting}>
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
