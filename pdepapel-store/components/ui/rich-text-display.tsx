"use client";

import { richTextToPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface RichTextDisplayProps {
  content?: string | null;
  className?: string;
  fallback?: string;
}

export function RichTextDisplay({
  content,
  className,
  fallback = "Sin descripción",
}: RichTextDisplayProps) {
  const sanitizedContent = useMemo(
    () => sanitizeRichTextHtml(content),
    [content],
  );
  const plainText = useMemo(
    () => richTextToPlainText(sanitizedContent),
    [sanitizedContent],
  );

  if (!sanitizedContent || !plainText) {
    return (
      <span className={cn("text-muted-foreground", className)}>{fallback}</span>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:leading-relaxed prose-p:text-foreground",
        "prose-strong:font-semibold prose-strong:text-foreground",
        "prose-em:text-foreground",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-foreground",
        "prose-pre:bg-muted prose-pre:text-foreground",
        "prose-blockquote:border-l-border prose-blockquote:text-muted-foreground",
        "prose-ol:text-foreground prose-ul:text-foreground",
        "prose-li:text-foreground",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-h1:text-foreground prose-h2:text-foreground prose-h3:text-foreground prose-h4:text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
