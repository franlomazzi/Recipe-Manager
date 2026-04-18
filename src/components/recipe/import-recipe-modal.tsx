"use client";

// Entry point for the recipe-import feature. Renders its own trigger button
// (for composition on the recipes list page) and, on submit, parses the
// source via /api/import-recipe, stashes the draft in sessionStorage, and
// navigates to /recipes/new?from=import where the form pre-fills.
//
// Active tabs: Text (phase 1), YouTube (phase 2). URL and Image tabs are
// rendered as disabled placeholders.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Download, Link2, Image as ImageIcon, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { importRecipe } from "@/lib/services/recipe-import";
import { stashImportDraft } from "@/lib/utils/session-draft";
import type { ImportSource } from "@/lib/types/import";

export function ImportRecipeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function runImport(source: ImportSource, loadingMessage: string) {
    setLoading(true);
    try {
      const draft = await importRecipe(source);
      stashImportDraft(draft);
      setOpen(false);
      setText("");
      setYoutubeUrl("");
      router.push("/recipes/new?from=import");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
    // loadingMessage surfaced via button label — kept as arg so future tabs
    // can customize the "Asking Gemini…" verb without duplicating the flow.
    void loadingMessage;
  }

  async function handleImportText() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Paste some recipe content first.");
      return;
    }
    await runImport({ type: "text", text: trimmed }, "Asking Gemini…");
  }

  async function handleImportYouTube() {
    const trimmed = youtubeUrl.trim();
    if (!trimmed) {
      toast.error("Paste a YouTube URL first.");
      return;
    }
    await runImport({ type: "youtube", url: trimmed }, "Watching video…");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="rounded-xl">
            <Download className="mr-2 h-4 w-4" />
            Import
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a recipe</DialogTitle>
          <DialogDescription>
            Drop in a recipe from anywhere — AI turns it into our format, you
            review and save.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="text" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="youtube">
              <PlayCircle className="mr-1 h-3 w-3" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="url" disabled>
              <Link2 className="mr-1 h-3 w-3" />
              URL
            </TabsTrigger>
            <TabsTrigger value="image" disabled>
              <ImageIcon className="mr-1 h-3 w-3" />
              Image
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4 space-y-3">
            <Textarea
              placeholder="Paste a recipe here — ingredients, steps, notes, anything. Gemini will structure it."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              disabled={loading}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImportText} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Asking Gemini…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="youtube" className="mt-4 space-y-3">
            <Input
              type="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={loading}
              inputMode="url"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Gemini will watch the video — what's said and what's shown — and
              pull the recipe out. This can take a minute or two for longer
              videos.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImportYouTube} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Watching video…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
