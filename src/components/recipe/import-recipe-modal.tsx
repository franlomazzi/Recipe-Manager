"use client";

// Entry point for the recipe-import feature. Renders its own trigger button
// (for composition on the recipes list page) and, on submit, parses the
// source via /api/import-recipe, stashes the draft in sessionStorage, and
// navigates to /recipes/new?from=import where the form pre-fills.
//
// Tabs: Text, YouTube, URL, Image. All active.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Download, Link2, Image as ImageIcon, PlayCircle, Upload } from "lucide-react";

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

// Client-side cap on image size before we even call the server. Gemini's
// own image limit is higher, but we want to fail fast + friendly on giant
// files rather than 413-ing after a slow upload. Base64 inflates by ~33%,
// so a 7 MB raw file becomes ~9.3 MB over the wire — under our 12 MB body
// cap in the route.
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Read a File as base64 (no data: prefix). Keeping this here rather than
// shipping a helper file — it's tiny and used only by the import modal.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected file read result."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function ImportRecipeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function runImport(source: ImportSource, loadingMessage: string) {
    setLoading(true);
    try {
      const draft = await importRecipe(source);
      stashImportDraft(draft);
      setOpen(false);
      setText("");
      setYoutubeUrl("");
      setPageUrl("");
      setImageFile(null);
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

  async function handleImportUrl() {
    const trimmed = pageUrl.trim();
    if (!trimmed) {
      toast.error("Paste a recipe URL first.");
      return;
    }
    await runImport({ type: "url", url: trimmed }, "Fetching page…");
  }

  async function handleImportImage() {
    if (!imageFile) {
      toast.error("Choose an image first.");
      return;
    }
    if (!ACCEPTED_MIME.has(imageFile.type)) {
      toast.error("Use a JPEG, PNG, WebP, or HEIC image.");
      return;
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      toast.error("Image is too large. Keep it under 7 MB.");
      return;
    }
    try {
      const imageBase64 = await readFileAsBase64(imageFile);
      await runImport(
        { type: "image", imageBase64, mimeType: imageFile.type },
        "Reading image…"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read image.");
    }
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
            <TabsTrigger value="url">
              <Link2 className="mr-1 h-3 w-3" />
              URL
            </TabsTrigger>
            <TabsTrigger value="image">
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
              Gemini will watch the video — what&apos;s said and what&apos;s shown — and
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

          <TabsContent value="url" className="mt-4 space-y-3">
            <Input
              type="url"
              placeholder="https://example.com/recipes/chocolate-cake"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              disabled={loading}
              inputMode="url"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Paste any recipe page — food blog, cooking site, whatever.
              We&apos;ll fetch it, prefer structured data when the site has it,
              and hand the rest to Gemini.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImportUrl} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching page…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="image" className="mt-4 space-y-3">
            <label
              className={`flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary/50 ${
                loading ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              {imageFile ? (
                <>
                  <span className="text-sm font-medium truncate max-w-full">
                    {imageFile.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(imageFile.size / (1024 * 1024)).toFixed(1)} MB — click to change
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm">Choose a recipe photo or screenshot</span>
                  <span className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, or HEIC · up to 7 MB
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={loading}
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Cookbook page, Instagram screenshot, handwritten card — Gemini
              will read the text and structure the recipe.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImportImage} disabled={loading || !imageFile}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reading image…
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
