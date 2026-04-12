"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePlanTemplates } from "@/lib/hooks/use-plan-templates";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import {
  deleteTemplate,
  endInstanceEarly,
} from "@/lib/firebase/meal-plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays,
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  LayoutTemplate,
  Square,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { WeeklyView } from "@/components/meal-plan/weekly-view";
import { TemplateEditor } from "@/components/meal-plan/template-editor";
import { StartPlanDialog } from "@/components/meal-plan/start-plan-dialog";
import type { PlanTemplate } from "@/lib/types/meal-plan";

export default function MealPlanPage() {
  const { user } = useAuth();
  const { templates, loading: templatesLoading } = usePlanTemplates();
  const { instance, loading: planLoading } = useActivePlan();

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

  // ─── Templates view ───
  if (showTemplates || !instance) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          {instance && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowTemplates(false)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {instance ? "Templates" : "Meal Plan"}
          </h1>
        </div>

        {!instance && (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <div>
                <p className="font-medium">No active plan</p>
                <p className="text-sm text-muted-foreground">
                  Create a template and start a plan to see your weekly menu.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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

  // ─── Active plan view (full-bleed) ───
  return (
    <div className="flex h-full flex-col p-2 md:p-3">
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
