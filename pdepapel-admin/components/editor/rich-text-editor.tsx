"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RichTextTemplate } from "@/lib/product-description-templates";
import { normalizeRichTextLink } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

import "./rich-text-editor.css";

import Color from "@tiptap/extension-color";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import SubScript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  RemoveFormattingIcon,
  SmilePlus,
  Strikethrough,
  Subscript,
  Superscript as SuperscriptIcon,
  Type,
  Underline as UnderlineIcon,
  Undo,
  Unlink,
} from "lucide-react";
import * as React from "react";

const TEXT_COLORS = [
  { value: "#1E1B4B", label: "Azul tinta" },
  { value: "#DB2777", label: "Rosa kawaii" },
  { value: "#C2410C", label: "Naranja durazno" },
  { value: "#7E22CE", label: "Lila" },
  { value: "#047857", label: "Verde menta" },
  { value: "#0369A1", label: "Azul cielo" },
] as const;

const KAWAII_EMOJIS = [
  "✨",
  "🌸",
  "🎀",
  "🩷",
  "🫶",
  "🐻",
  "🐰",
  "🍓",
  "☁️",
  "📚",
  "🖍️",
  "🎁",
];

interface RichTextEditorProps {
  value?: string;
  placeholder?: string;
  onChange?: (content: string) => void;
  className?: string;
  templates?: RichTextTemplate[];
  showSeoGuidance?: boolean;
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "",
  className,
  templates = [],
  showSeoGuidance = false,
}: RichTextEditorProps) {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkError, setLinkError] = React.useState("");
  const linkInputId = React.useId();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
        },
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      CharacterCount,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Superscript,
      SubScript,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
      forceUpdate();
    },
    onSelectionUpdate: () => {
      forceUpdate();
    },
    onTransaction: () => {
      forceUpdate();
    },
    editorProps: {
      attributes: {
        class: cn(
          "block border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "prose prose-sm sm:prose-base max-w-full",
        ),
      },
    },
  });

  // Sync editor content when value prop changes externally (e.g. form reset/restore)
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const openLinkDialog = React.useCallback(() => {
    if (!editor) return;

    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkError("");
    setIsLinkDialogOpen(true);
  }, [editor]);

  const applyLink = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editor) return;

      const normalizedUrl = normalizeRichTextLink(linkUrl);
      if (!normalizedUrl) {
        setLinkError("Usa una URL https://, una ruta interna /... o mailto:.");
        return;
      }

      const isExternal = /^https?:\/\//i.test(normalizedUrl);
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({
          href: normalizedUrl,
          target: isExternal ? "_blank" : null,
          rel: isExternal ? "noopener noreferrer" : null,
        })
        .run();
      setIsLinkDialogOpen(false);
    },
    [editor, linkUrl],
  );

  if (!editor) {
    return null;
  }

  const characterCount = editor.storage.characterCount.characters();
  const wordCount = editor.storage.characterCount.words();
  const seoGuidance =
    characterCount === 0
      ? "Describe beneficios, medidas y detalles útiles para quien compra."
      : characterCount < 120
        ? "Añade detalles útiles: una descripción más completa mejora su claridad."
        : characterCount <= 600
          ? "Longitud clara para clientes y buscadores."
          : "La descripción es extensa: prioriza secciones y listas para facilitar la lectura.";

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleGroup type="multiple" size="sm" variant="outline">
          <ToggleGroupItem
            value="bold"
            aria-label="Toggle bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            data-state={editor.isActive("bold") ? "on" : "off"}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="strike"
            aria-label="Toggle strikethrough"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            data-state={editor.isActive("strike") ? "on" : "off"}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="italic"
            aria-label="Toggle italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            data-state={editor.isActive("italic") ? "on" : "off"}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="underline"
            aria-label="Toggle underline"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            disabled={!editor.can().chain().focus().toggleUnderline().run()}
            data-state={editor.isActive("underline") ? "on" : "off"}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="code"
            aria-label="Toggle code"
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={!editor.can().chain().focus().toggleCode().run()}
            data-state={editor.isActive("code") ? "on" : "off"}
          >
            <Code className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="highlight"
            aria-label="Toggle highlight"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            disabled={!editor.can().chain().focus().toggleHighlight().run()}
            data-state={editor.isActive("highlight") ? "on" : "off"}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="clear"
            aria-label="Clear formatting"
            onClick={() =>
              editor.chain().focus().clearNodes().unsetAllMarks().run()
            }
            disabled={
              !editor.can().chain().focus().clearNodes().unsetAllMarks().run()
            }
            data-state="off"
          >
            <RemoveFormattingIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>

        <div
          className="flex items-center gap-1 rounded-md border border-input p-1"
          role="group"
          aria-label="Color de texto"
        >
          <Type className="mx-1 h-3.5 w-3.5 text-muted-foreground" />
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={`Aplicar color ${color.label}`}
              title={color.label}
              onClick={() => editor.chain().focus().setColor(color.value).run()}
              className="h-5 w-5 rounded-full border border-white shadow-sm ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={{ backgroundColor: color.value }}
            />
          ))}
          <button
            type="button"
            aria-label="Restablecer color de texto"
            title="Restablecer color"
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-input bg-background text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ×
          </button>
        </div>

        <div
          className="flex max-w-full items-center gap-1 rounded-md border border-input p-1"
          role="group"
          aria-label="Insertar emoji"
        >
          <SmilePlus className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex max-w-[15rem] gap-0.5 overflow-x-auto">
            {KAWAII_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Insertar emoji ${emoji}`}
                onClick={() =>
                  editor.chain().focus().insertContent(emoji).run()
                }
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {templates.length > 0 && (
          <div
            className="flex max-w-full items-center gap-1 rounded-md border border-input p-1"
            role="group"
            aria-label="Plantillas de descripción"
          >
            <span className="px-1 text-xs font-medium text-muted-foreground">
              Plantillas
            </span>
            <div className="flex max-w-[24rem] gap-1 overflow-x-auto">
              {templates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() =>
                    editor.chain().focus().insertContent(template.content).run()
                  }
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <ToggleGroup type="single" size="sm" variant="outline">
          <ToggleGroupItem
            value="h2"
            aria-label="Heading 2"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            disabled={
              !editor.can().chain().focus().toggleHeading({ level: 2 }).run()
            }
            data-state={editor.isActive("heading", { level: 2 }) ? "on" : "off"}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="h3"
            aria-label="Heading 3"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            disabled={
              !editor.can().chain().focus().toggleHeading({ level: 3 }).run()
            }
            data-state={editor.isActive("heading", { level: 3 }) ? "on" : "off"}
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="h4"
            aria-label="Heading 4"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 4 }).run()
            }
            disabled={
              !editor.can().chain().focus().toggleHeading({ level: 4 }).run()
            }
            data-state={editor.isActive("heading", { level: 4 }) ? "on" : "off"}
          >
            <Heading4 className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup type="multiple" size="sm" variant="outline">
          <ToggleGroupItem
            value="blockquote"
            aria-label="Toggle blockquote"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            disabled={!editor.can().chain().focus().toggleBlockquote().run()}
            data-state={editor.isActive("blockquote") ? "on" : "off"}
          >
            <Quote className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="bulletList"
            aria-label="Toggle bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={!editor.can().chain().focus().toggleBulletList().run()}
            data-state={editor.isActive("bulletList") ? "on" : "off"}
          >
            <List className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="orderedList"
            aria-label="Toggle ordered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={!editor.can().chain().focus().toggleOrderedList().run()}
            data-state={editor.isActive("orderedList") ? "on" : "off"}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="horizontalRule"
            aria-label="Add horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={!editor.can().chain().focus().setHorizontalRule().run()}
            data-state="off"
          >
            <Minus className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="superscript"
            aria-label="Toggle superscript"
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            disabled={!editor.can().chain().focus().toggleSuperscript().run()}
            data-state={editor.isActive("superscript") ? "on" : "off"}
          >
            <SuperscriptIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="subscript"
            aria-label="Toggle subscript"
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            disabled={!editor.can().chain().focus().toggleSubscript().run()}
            data-state={editor.isActive("subscript") ? "on" : "off"}
          >
            <Subscript className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex rounded-md border border-input">
          <button
            type="button"
            aria-label="Agregar o editar enlace"
            title="Agregar o editar enlace"
            onClick={openLinkDialog}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-l-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              editor.isActive("link") && "bg-muted",
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Quitar enlace"
            title="Quitar enlace"
            onClick={() => editor.chain().focus().unsetLink().run()}
            disabled={!editor.isActive("link")}
            className="flex h-8 w-8 items-center justify-center rounded-r-md border-l border-input transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        </div>

        <ToggleGroup type="single" size="sm" variant="outline">
          <ToggleGroupItem
            value="left"
            aria-label="Align left"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            disabled={!editor.can().chain().focus().setTextAlign("left").run()}
            data-state={editor.isActive({ textAlign: "left" }) ? "on" : "off"}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="center"
            aria-label="Align center"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            disabled={
              !editor.can().chain().focus().setTextAlign("center").run()
            }
            data-state={editor.isActive({ textAlign: "center" }) ? "on" : "off"}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="right"
            aria-label="Align right"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            disabled={!editor.can().chain().focus().setTextAlign("right").run()}
            data-state={editor.isActive({ textAlign: "right" }) ? "on" : "off"}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="justify"
            aria-label="Align justify"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            disabled={
              !editor.can().chain().focus().setTextAlign("justify").run()
            }
            data-state={
              editor.isActive({ textAlign: "justify" }) ? "on" : "off"
            }
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup type="single" size="sm" variant="outline">
          <ToggleGroupItem
            value="undo"
            aria-label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
          >
            <Undo className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="redo"
            aria-label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
          >
            <Redo className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <BubbleMenu
        editor={editor}
        shouldShow={({ from, to }) => from !== to && editor.isEditable}
      >
        <div className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-lg">
          <button
            type="button"
            aria-label="Negrita"
            onMouseDown={(event) => {
              event.preventDefault();
              editor.chain().focus().toggleBold().run();
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted",
              editor.isActive("bold") && "bg-muted",
            )}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Cursiva"
            onMouseDown={(event) => {
              event.preventDefault();
              editor.chain().focus().toggleItalic().run();
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted",
              editor.isActive("italic") && "bg-muted",
            )}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Resaltar"
            onMouseDown={(event) => {
              event.preventDefault();
              editor.chain().focus().toggleHighlight().run();
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted",
              editor.isActive("highlight") && "bg-muted",
            )}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Agregar enlace"
            onMouseDown={(event) => {
              event.preventDefault();
              openLinkDialog();
            }}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-muted"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={`Aplicar color ${color.label}`}
              title={color.label}
              onMouseDown={(event) => {
                event.preventDefault();
                editor.chain().focus().setColor(color.value).run();
              }}
              className="h-4 w-4 rounded-full border border-white shadow-sm ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} className="flex min-h-[200px]" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {wordCount} {wordCount === 1 ? "palabra" : "palabras"}
        </span>
        <span>
          {characterCount} {characterCount === 1 ? "carácter" : "caracteres"}
        </span>
        {showSeoGuidance && <span>{seoGuidance}</span>}
      </div>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar enlace</DialogTitle>
            <DialogDescription>
              Usa una URL https://, una ruta interna como /categoria/agendas o
              un correo con mailto:.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={applyLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={linkInputId}>Destino del enlace</Label>
              <Input
                id={linkInputId}
                value={linkUrl}
                onChange={(event) => {
                  setLinkUrl(event.target.value);
                  setLinkError("");
                }}
                placeholder="https://... o /categoria/agendas"
                autoFocus
                aria-invalid={Boolean(linkError)}
              />
              {linkError && (
                <p className="text-sm text-destructive">{linkError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLinkDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar enlace</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
