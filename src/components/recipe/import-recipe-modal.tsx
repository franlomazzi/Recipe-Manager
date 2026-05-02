"use client";

// Entry point for the recipe-import feature. Renders its own trigger button
// (for composition on the recipes list page) and, on submit, parses the
// source via /api/import-recipe, stashes the draft in sessionStorage, and
// navigates to /recipes/new?from=import where the form pre-fills.
//
// If the parsed recipe is in English or Spanish, an intermediate step offers
// to translate it to the other language before proceeding.
//
// Tabs: Text, YouTube, URL, Image. All active.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Download, Link2, Image as ImageIcon, PlayCircle, Upload, Languages } from "lucide-react";

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

import { importRecipe, translateImportedRecipe } from "@/lib/services/recipe-import";
import { stashImportDraft } from "@/lib/utils/session-draft";
import type { DraftRecipe, ImportSource } from "@/lib/types/import";

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

const LANG_NAMES: Record<"en" | "es", string> = { en: "English", es: "Spanish" };

interface ImportRecipeModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ImportRecipeModal({ open: controlledOpen, onOpenChange }: ImportRecipeModalProps = {}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const [text, setText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  // Set when the parsed recipe is in a known language — pauses the flow to
  // offer translation before stashing + navigating.
  const [pendingDraft, setPendingDraft] = useState<DraftRecipe | null>(null);
  const [translating, setTranslating] = useState(false);

  function resetForm() {
    setText("");
    setYoutubeUrl("");
    setPageUrl("");
    setImageFile(null);
    setPendingDraft(null);
  }

  function closeModal() {
    if (isControlled) onOpenChange?.(false);
    else setInternalOpen(false);
  }

  // Final step: stash the draft and navigate to the review form.
  function proceed(draft: DraftRecipe) {
    stashImportDraft(draft);
    closeModal();
    resetForm();
    router.push("/recipes/new?from=import");
  }

  async function runImport(source: ImportSource, loadingMessage: string) {
    setLoading(true);
    try {
      const draft = await importRecipe(source);
      const lang = draft.detectedLanguage;
      if (lang === "en" || lang === "es") {
        // Pause and let the user decide whether to translate.
        setPendingDraft(draft);
      } else {
        proceed(draft);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
    // loadingMessage surfaced via button label — kept as arg so future tabs
    // can customize the "Asking Gemini…" verb without duplicating the flow.
    void loadingMessage;
  }

  async function handleTranslate(targetLanguage: "en" | "es") {
    if (!pendingDraft) return;
    setTranslating(true);
    try {
      const translated = await translateImportedRecipe(pendingDraft, targetLanguage);
      proceed(translated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed.");
    } finally {
      setTranslating(false);
    }
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

  // The detected language is always "en" or "es" when pendingDraft is set.
  const detectedLang = pendingDraft?.detectedLanguage as "en" | "es" | undefined;
  const targetLang = detectedLang === "en" ? "es" : "en";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isControlled) {
          onOpenChange?.(v);
        } else {
          setInternalOpen(v);
        }
        if (!v) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger
          render={
            <Button variant="outline" className="rounded-xl">
              <Download className="mr-2 h-4 w-4" />
              Import
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pendingDraft ? "Translate recipe?" : "Import a recipe"}
          </DialogTitle>
          <DialogDescription>
            {pendingDraft
              ? `The recipe appears to be in ${detectedLang ? LANG_NAMES[detectedLang] : "a known language"}. Translate it before reviewing?`
              : "Drop in a recipe from anywhere — AI turns it into our format, you review and save."}
          </DialogDescription>
        </DialogHeader>

        {pendingDraft && detectedLang ? (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Languages className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                &ldquo;{pendingDraft.title}&rdquo;
              </span>{" "}
              was imported in {LANG_NAMES[detectedLang]}.
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                onClick={() => handleTranslate(targetLang)}
                disabled={translating}
                className="sm:w-auto"
              >
                {translating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Translating…
                  </>
                ) : (
                  `Translate to ${LANG_NAMES[targetLang]}`
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => proceed(pendingDraft)}
                disabled={translating}
                className="sm:w-auto"
              >
                Keep in {LANG_NAMES[detectedLang]}
              </Button>
            </div>
          </div>
        ) : (
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
                  onClick={() => closeModal()}
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
                  onClick={() => closeModal()}
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
                  onClick={() => closeModal()}
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
                  onClick={() => closeModal()}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
