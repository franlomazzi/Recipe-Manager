"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { CookingStepDisplay } from "./cooking-step-display";
import { TimerBar } from "./timer-bar";
import { AddRecipeSheet } from "./add-recipe-sheet";
import { VoiceControl } from "./voice-control";
import { VoiceDictationOverlay } from "./voice-dictation-overlay";
import { useVoiceControl } from "@/lib/voice/use-voice-control";
import { ChevronLeft, Plus, X } from "lucide-react";

export function MultiCookView() {
  const router = useRouter();
  const { sessions, activeSessionId, setActiveSession, removeSession } =
    useCookingSession();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const voice = useVoiceControl();

  useEffect(() => {
    if (sessions.length === 0) {
      router.replace("/");
    }
  }, [sessions.length, router]);

  if (sessions.length === 0) {
    return null;
  }

  const activeSession =
    sessions.find((s) => s.recipeId === activeSessionId) || sessions[0];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Top bar with recipe tabs */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="md:text-base"
          onClick={() => router.push("/recipes")}
        >
          <ChevronLeft className="mr-1 h-4 w-4 md:h-5 md:w-5" />
          <span className="hidden sm:inline">Recipes</span>
          <span className="sm:hidden">Back</span>
        </Button>

        <div className="flex-1 overflow-x-auto mx-2 md:mx-4">
          <div className="flex items-center gap-2 justify-center">
            {sessions.map((session) => {
              const isActive = session.recipeId === activeSession.recipeId;
              return (
                <div
                  key={session.recipeId}
                  className={`group flex items-center rounded-xl border transition-colors shrink-0 ${
                    isActive
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/40 border-transparent hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSession(session.recipeId)}
                    className="px-3 py-1.5 md:py-2 text-xs md:text-sm font-medium truncate max-w-[140px] md:max-w-[200px]"
                  >
                    {session.recipe.title}
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {session.currentStep + 1}/{session.recipe.steps.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSession(session.recipeId)}
                    className="px-2 py-2 opacity-60 hover:opacity-100"
                    aria-label="Stop cooking this recipe"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <VoiceControl voice={voice} />
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setShowAddSheet(true)}
          >
            <Plus className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Add recipe</span>
          </Button>
        </div>
      </div>

      {/* Active session content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <CookingStepDisplay key={activeSession.recipeId} session={activeSession} />
      </div>

      {/* Global timer bar */}
      <TimerBar />

      {showAddSheet && <AddRecipeSheet onClose={() => setShowAddSheet(false)} />}

      {voice.dictation && (
        <VoiceDictationOverlay
          dictation={voice.dictation}
          onSave={voice.saveDictation}
          onCancel={voice.cancelDictation}
        />
      )}
    </div>
  );
}
