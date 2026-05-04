import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BreadcrumbUploadButtonProps {
  articleId?: string | null;
  articleSlug?: string;
  articleTitle?: string;
  articleLabel?: string;
  /** Optional callback fired with the public URL of the first uploaded image. */
  onUploaded?: (url: string) => void;
  /** Visual variant for the trigger button. */
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

/**
 * One-click upload for manually-prepared "Breadcrumb" images
 * (Instagram / Facebook / Threads style social cards).
 *
 * - No cropping, no resizing — uploads files exactly as provided.
 * - Tags every upload with `is_breadcrumb = true` and the current article context.
 * - Stored in the same `social-gallery` bucket so they're available globally.
 */
export function BreadcrumbUploadButton({
  articleId,
  articleSlug,
  articleTitle,
  articleLabel,
  onUploaded,
  variant = "outline",
  size = "sm",
  className,
}: BreadcrumbUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  // Check if a breadcrumb image already exists for this article.
  // Shows a checkmark on the button so the user can see at a glance — re-uploading
  // simply adds a new one (most-recent wins downstream).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!articleId && !articleSlug) { setHasExisting(false); return; }
      const q = (supabase as any)
        .from("social_media_gallery")
        .select("id", { count: "exact", head: true })
        .eq("is_breadcrumb", true);
      const { count } = articleId
        ? await q.eq("related_article_id", articleId)
        : await q.eq("related_article_slug", articleSlug);
      if (!cancelled) setHasExisting((count || 0) > 0);
    };
    check();
    return () => { cancelled = true; };
  }, [articleId, articleSlug, uploading]);

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    let uploadCount = 0;
    let firstUrl: string | null = null;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `breadcrumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("social-gallery")
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("social-gallery")
        .getPublicUrl(fileName);
      if (!urlData?.publicUrl) continue;

      const { error: dbErr } = await (supabase as any)
        .from("social_media_gallery")
        .insert({
          file_name: fileName,
          display_name: file.name.replace(/\.[^.]+$/, ""),
          file_url: urlData.publicUrl,
          source_type: "uploaded",
          mime_type: file.type,
          file_size_bytes: file.size,
          is_breadcrumb: true,
          tags: ["breadcrumb"],
          related_article_id: articleId || null,
          related_article_slug: articleSlug || null,
          related_article_title: articleTitle || null,
          related_article_label: articleLabel || null,
          image_usage_context: "gallery",
        });

      if (dbErr) {
        toast.error(`Catalog insert failed: ${dbErr.message}`);
        continue;
      }

      if (!firstUrl) firstUrl = urlData.publicUrl;
      uploadCount++;
    }

    if (uploadCount > 0) {
      toast.success(
        `${uploadCount} breadcrumb image(s) uploaded${
          articleLabel ? ` for ${articleLabel}` : ""
        }`,
      );
      if (firstUrl) onUploaded?.(firstUrl);
      setHasExisting(true);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        title={
          hasExisting
            ? "Breadcrumb image already uploaded — click to replace/add another"
            : "Upload manually-prepared social breadcrumb image (no cropping)"
        }
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : hasExisting ? (
          <Check className="h-4 w-4 mr-2 text-primary" />
        ) : (
          <Link2 className="h-4 w-4 mr-2" />
        )}
        {uploading ? "Uploading…" : "Breadcrumbs"}
      </Button>
    </>
  );
}