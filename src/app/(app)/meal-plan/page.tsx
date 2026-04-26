"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useAuth } from "@/lib/contexts/auth-context";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { usePlanTemplates } from "@/lib/hooks/use-plan-templates";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { useAdhocWeek } from "@/lib/hooks/use-adhoc-week";
import {
  deleteTemplate,
  endInstanceEarly,
  currentWeekMonday,
} from "@/lib/firebase/meal-plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  LayoutTemplate,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { WeeklyView } from "@/components/meal-plan/weekly-view";
import { TemplateEditor } from "@/components/meal-plan/template-editor";
import { StartPlanDialog } from "@/components/meal-plan/start-plan-dialog";
import type { PlanInstance, PlanTemplate } from "@/lib/types/meal-plan";

export default function MealPlanPage() {
  const { user } = useAuth();
  const isKT = useKitchenTool();
  const { templates, loading: templatesLoading } = usePlanTemplates();
  const { instance, loading: planLoading } = useActivePlan();
  const { adhocWeeks, updateAdhocDay } = useAdhocWeek();

  const [showTemplates, setShowTemplates] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<
    PlanTemplate | undefined
  >();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [startingTemplate, setStartingTemplate] = useState<
    PlanTemplate | undefined
  >();
  const [endingPlan, setEndingPlan] = useState(false);

  function handleCreateTemplate() {
    setEditingTemplate(undefined);
    setEditorOpen(true);
  }

  function handleEditTemplate(template: PlanTemplate) {
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  async function handleDeleteTemplate(template: PlanTemplate) {
    try {
      await deleteTemplate(template.id);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  }

  function handleStartPlan(template: PlanTemplate) {
    setStartingTemplate(template);
    setStartDialogOpen(true);
  }

  async function handleEndPlan() {
    if (!instance) return;
    setEndingPlan(true);
    try {
      await endInstanceEarly(instance.id, "");
      toast.success("Plan ended");
    } catch {
      toast.error("Failed to end plan");
    } finally {
      setEndingPlan(false);
    }
  }

  const loading = templatesLoading || planLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── KT Templates view ───
  if (isKT && showTemplates) {
    return (
      <div className="kt-meal-plan mx-auto max-w-5xl px-5 py-6 md:px-8 md:py-10">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <div className="kt-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Library &middot; Plans
            </div>
            <h1 className="kt-serif mt-1 text-3xl font-medium md:text-4xl">
              Templates
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(false)}
              className="kt-mono flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <button
              onClick={handleCreateTemplate}
              className="kt-mono flex items-center gap-1.5 bg-primary px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-primary-foreground"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="mt-8 border border-dashed border-[var(--border)] px-6 py-16 text-center">
            <LayoutTemplate className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="kt-mono mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              No templates yet
            </p>
          </div>
        ) : (
          <div className="mt-6 border-t border-[var(--border)]">
            <div className="hidden grid-cols-[2fr_auto_auto_auto] items-center gap-4 border-b border-[var(--border)] px-2 py-2 md:grid">
              <span className="kt-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Template</span>
              <span className="kt-mono text-right text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Weeks</span>
              <span className="kt-mono text-right text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Meals</span>
              <span className="kt-mono text-right text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Actions</span>
            </div>
            {templates.map((template) => (
              <div
                key={template.id}
                className="grid grid-cols-1 gap-3 border-b border-[var(--border)] px-2 py-4 md:grid-cols-[2fr_auto_auto_auto] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <h3 className="kt-serif truncate text-lg font-medium">{template.name}</h3>
                  {template.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="kt-mono text-right text-sm tabular-nums">
                  {template.weeks.length}w
                </div>
                <div className="kt-mono text-right text-sm tabular-nums text-muted-foreground">
                  {countMeals(template)}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleStartPlan(template)}
                    disabled={!!instance}
                    className="kt-mono flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-40"
                  >
                    <Play className="h-3 w-3" /> Start
                  </button>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="flex h-7 w-7 items-center justify-center border border-[var(--border)] text-muted-foreground hover:text-foreground"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template)}
                    className="flex h-7 w-7 items-center justify-center border border-[var(--border)] text-muted-foreground hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <TemplateEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={editingTemplate}
        />
        {startingTemplate && (
          <StartPlanDialog
            open={startDialogOpen}
            onOpenChange={(open) => {
              setStartDialogOpen(open);
              if (!open) setShowTemplates(false);
            }}
            template={startingTemplate}
          />
        )}
      </div>
    );
  }

  // ─── Templates view ───
  if (showTemplates) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowTemplates(false)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
          <Button size="sm" onClick={handleCreateTemplate}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No templates yet. Create one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {template.name}
                      </CardTitle>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 ml-2">
                      {template.weeks.length}w
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground mb-3">
                    {countMeals(template)} meals planned
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={() => handleStartPlan(template)}
                      disabled={!!instance}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditTemplate(template)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTemplate(template)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {instance && (
                    <p className="text-xs text-muted-foreground mt-2">
                      End current plan first
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <TemplateEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={editingTemplate}
        />
        {startingTemplate && (
          <StartPlanDialog
            open={startDialogOpen}
            onOpenChange={(open) => {
              setStartDialogOpen(open);
              if (!open) setShowTemplates(false);
            }}
            template={startingTemplate}
          />
        )}
      </div>
    );
  }

  // ─── Freestyle view (no active plan) ───
  if (!instance) {
    const monday = currentWeekMonday();
    const emptyDays = () => Array.from({ length: 7 }, () => ({ meals: [] }));
    const freestyleInstance: PlanInstance = {
      id: "freestyle",
      userId: user!.uid,
      templateId: "",
      templateName: "Freestyle",
      snapshot: adhocWeeks.map((w) => w?.snapshot[0] ?? { days: emptyDays() }),
      startDate: monday,
      endDate: format(addDays(parseISO(monday), 27), "yyyy-MM-dd"),
      status: "adhoc",
    };
    return (
      <div className={`flex h-full flex-col p-2 md:p-3${isKT ? " kt-meal-plan" : ""}`}>
        <div className="flex items-center justify-between px-1 pb-1 shrink-0">
          <span className="text-xs text-muted-foreground">No active plan</span>
          <button
            onClick={() => setShowTemplates(true)}
            className="text-xs text-primary hover:underline"
          >
            Templates →
          </button>
        </div>
        <WeeklyView
          instance={freestyleInstance}
          onShowTemplates={() => setShowTemplates(true)}
          onEndPlan={() => {}}
          endingPlan={false}
          onUpdateDay={updateAdhocDay}
        />
        <TemplateEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={editingTemplate}
        />
      </div>
    );
  }

  // ─── Active plan view (full-bleed) ───
  return (
    <div className={`flex h-full flex-col p-2 md:p-3${isKT ? " kt-meal-plan" : ""}`}>
      <WeeklyView
        instance={instance}
        onShowTemplates={() => setShowTemplates(true)}
        onEndPlan={handleEndPlan}
        endingPlan={endingPlan}
      />

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
      />
    </div>
  );
}

function countMeals(template: PlanTemplate): number {
  return template.weeks.reduce(
    (total, week) =>
      total +
      week.days.reduce((dayTotal, day) => dayTotal + day.meals.length, 0),
    0
  );
}
