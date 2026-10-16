"use client";

import { ChevronRight, ClipboardCopy } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { parseAnswer, plainCopyText, splitTags, type AnswerBlock, type ListBlock } from "@/lib/copiloto/answer-blocks";
import { descriptionBlockToHtml, descriptionBlockToPlainText } from "@/lib/copiloto/description-html";
import { cn } from "@/lib/utils";

import { BoldText } from "./bold-text";

/** Copia en HTML (para pegar en la ficha) y en texto plano, sin etiquetas ni markdown. */
export async function copyRichText(block: string): Promise<boolean> {
  const clean = plainCopyText(block);
  if (!clean) return false;
  const html = descriptionBlockToHtml(clean);
  const plain = descriptionBlockToPlainText(clean);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
    return true;
  } catch {
    return false;
  }
}

const TAG_TONES: Record<string, string> = {
  quieto: "bg-tint-cream text-primary ring-1 ring-amber-300/70",
  "se vende": "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300/70",
  "margen bajo": "bg-destructive/10 text-destructive ring-1 ring-destructive/40",
};

// «margen bajo (meta 35 %)» toma el tono de «margen bajo».
const toneOf = (label: string) => {
  const key = Object.keys(TAG_TONES).find((tone) => label.toLowerCase().startsWith(tone));
  return key ? TAG_TONES[key] : "bg-muted text-muted-foreground";
};

/** «[conocimiento: id]» se vuelve un enlace a la nota que Paula aprobó. */
function TextWithCitations({ text, storeId }: { text: string; storeId: string }) {
  const pieces = text.split(/(\[conocimiento:\s*[a-z0-9-]+\])/gi);
  return (
    <>
      {pieces.map((piece, index) => {
        const match = /^\[conocimiento:\s*([a-z0-9-]+)\]$/i.exec(piece);
        if (!match) return <BoldText key={index} text={piece} />;
        return (
          <Link
            key={index}
            href={`/${storeId}/copiloto/conocimiento#${match[1]}`}
            className="mx-0.5 rounded bg-tint-lavender px-1.5 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            nota: {match[1]}
          </Link>
        );
      })}
    </>
  );
}

function InlineText({ text, storeId }: { text: string; storeId: string }) {
  return (
    <>
      {splitTags(text).map((piece, index) =>
        piece.type === "tag" ? (
          <span
            key={index}
            data-tag={piece.label}
            className={cn("mx-0.5 inline-flex items-center whitespace-nowrap rounded-full px-1.5 align-[1px] text-[10px] font-semibold leading-4", toneOf(piece.label))}
          >
            {piece.label}
          </span>
        ) : (
          <TextWithCitations key={index} text={piece.text} storeId={storeId} />
        ),
      )}
    </>
  );
}

// Cada nivel se distingue por su marca y su tamaño, no solo por la sangría: en el teléfono un em no se ve.
const LIST_STYLES = [
  { ul: "list-disc pl-5", ol: "list-decimal pl-5", item: "" },
  { ul: "mt-1 list-[circle] border-l border-border/70 pl-5 ml-0.5", ol: "mt-1 list-decimal border-l border-border/70 pl-5 ml-0.5", item: "text-[13px]" },
  { ul: "mt-1 list-[square] pl-4", ol: "mt-1 list-decimal pl-4", item: "text-xs text-muted-foreground" },
];

function ListView({ list, depth, storeId }: { list: ListBlock; depth: number; storeId: string }) {
  const style = LIST_STYLES[Math.min(depth, LIST_STYLES.length - 1)];
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag className={cn("space-y-1", list.ordered ? style.ol : style.ul)} data-list-depth={depth}>
      {list.items.map((item, index) => (
        <li key={index} data-bullet-depth={depth} className={cn("break-words pl-0.5", style.item)}>
          <InlineText text={item.text} storeId={storeId} />
          {item.children ? <ListView list={item.children} depth={depth + 1} storeId={storeId} /> : null}
        </li>
      ))}
    </Tag>
  );
}

function CopyCard({ block, storeId }: { block: Extract<AnswerBlock, { type: "copy" }>; storeId: string }) {
  return (
    <details className="group my-2 rounded-xl border bg-background" open={!block.closed} data-testid="copy-block">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          {block.title}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!block.closed}
          onClick={async (event) => {
            event.preventDefault();
            const copied = await copyRichText(block.text);
            toast(
              copied
                ? { title: "Texto copiado", description: "Pégalo en la ficha y revísalo antes de guardar." }
                : { title: "No se pudo copiar", description: "Abre el bloque, selecciona el texto y cópialo a mano.", variant: "destructive" },
            );
          }}
        >
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
          Copiar
        </Button>
      </summary>
      <div className="border-t px-3 py-2">
        <Blocks blocks={block.blocks} storeId={storeId} />
      </div>
    </details>
  );
}

function Blocks({ blocks, storeId }: { blocks: AnswerBlock[]; storeId: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h3 key={index} className="mb-1 mt-3 text-[15px] font-semibold leading-snug first:mt-0">
                <InlineText text={block.text} storeId={storeId} />
              </h3>
            ) : (
              <h4 key={index} className="mb-0.5 mt-2.5 text-sm font-semibold leading-snug first:mt-0">
                <InlineText text={block.text} storeId={storeId} />
              </h4>
            );
          case "paragraph":
            return (
              <p key={index} className="break-words">
                <InlineText text={block.text} storeId={storeId} />
              </p>
            );
          case "list":
            return <ListView key={index} list={block} depth={0} storeId={storeId} />;
          case "details":
            return (
              <details key={index} className="group my-1.5" open={!block.closed} data-testid="details-block">
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                  {block.title}
                </summary>
                <div className="mt-1 pl-4">
                  <Blocks blocks={block.blocks} storeId={storeId} />
                </div>
              </details>
            );
          case "copy":
            return <CopyCard key={index} block={block} storeId={storeId} />;
          case "spacer":
            return <span key={index} className="block h-2" aria-hidden="true" />;
          default:
            return <Fragment key={index} />;
        }
      })}
    </>
  );
}

/** La respuesta del copiloto, con el formato de lib/copiloto/answer-blocks.ts. */
export function AnswerView({ text, storeId }: { text: string; storeId: string }) {
  return (
    <div className="space-y-1" data-testid="answer">
      <Blocks blocks={parseAnswer(text)} storeId={storeId} />
    </div>
  );
}
