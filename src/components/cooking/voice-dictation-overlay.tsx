"use client";

import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { Mic, Check, X } from "lucide-react";
import type { DictationState } from "@/lib/voice/use-voice-control";

interface Props {
  dictation: DictationState;
  onSave: () => void;
  onCancel: () => void;
}

export function VoiceDictationOverlay({ dictation, onSave, onCancel }: Props) {
  const { sessions } = useCookingSession();
  const session = sessions.find((s) => s.recipeId === dictation.recipeId);
  const existingNote = session?.stepNotes[dictation.stepIndex] ?? "";
  const stepNumber = dictation.stepIndex;

  const preview = dictation.buffer
    ? dictation.interim
      ? `${dictation.buffer} ${dictation.interim}`
      : dictation.buffer
    : dictation.interim;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-sm p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/40">
            <Mic className="h-5 w-5 text-primary animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Dictating note</h2>
            <p className="text-xs text-muted-foreground">
              {dictation.recipeTitle} · Step {stepNumber}
            </p>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground hidden sm:block">
          Say <span className="font-medium">&ldquo;save note&rdquo;</span> ·{" "}
          <span className="font-medium">&ldquo;scratch that&rdquo;</span> ·{" "}
          <span className="font-medium">&ldquo;cancel note&rdquo;</span>
        </div>
      </div>

      {existingNote && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Existing note
          </p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {existingNote}
          </p>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        {preview ? (
          <p className="text-center text-2xl md:text-4xl lg:text-5xl font-medium leading-snug max-w-4xl">
            <span className="text-foreground">{dictation.buffer}</span>
            {dictation.interim && (
              <>
                {dictation.buffer ? " " : ""}
                <span className="text-muted-foreground italic">
                  {dictation.interim}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="text-center text-xl md:text-2xl text-muted-foreground">
            Listening&hellip; just start talking.
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-medium hover:bg-muted"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dictation.buffer.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Save note
        </button>
      </div>
    </div>
  );
}
