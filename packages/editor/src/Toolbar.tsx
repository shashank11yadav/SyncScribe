"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

interface Item {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
}

const GROUPS: Item[][] = [
  [
    { label: "Undo", icon: Undo2, shortcut: "Mod+Z", run: (e) => e.chain().focus().undo().run(), enabled: (e) => e.can().undo() },
    { label: "Redo", icon: Redo2, shortcut: "Mod+Shift+Z", run: (e) => e.chain().focus().redo().run(), enabled: (e) => e.can().redo() },
  ],
  [
    { label: "Heading 1", icon: Heading1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
    { label: "Heading 2", icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
    { label: "Heading 3", icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { label: "Bold", icon: Bold, shortcut: "Mod+B", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
    { label: "Italic", icon: Italic, shortcut: "Mod+I", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
    { label: "Strikethrough", icon: Strikethrough, run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
    { label: "Inline code", icon: Code, run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive("code") },
  ],
  [
    { label: "Bulleted list", icon: List, run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { label: "Numbered list", icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { label: "Quote", icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
    { label: "Code block", icon: SquareCode, run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
  ],
];

const ITEMS = GROUPS.flat();

// Each button's position in the flat list, computed once so render stays pure.
const LAYOUT = GROUPS.map((group, g) =>
  group.map((item, i) => ({ item, index: GROUPS.slice(0, g).reduce((n, prev) => n + prev.length, 0) + i })),
);

/**
 * A single tab stop with arrow-key movement between buttons, following the
 * WAI-ARIA toolbar pattern.
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      ITEMS.map((item) => ({ active: item.active?.(e) ?? false, enabled: item.enabled?.(e) ?? true })),
  });
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const step = steps[event.key];
    let next: number | null = null;
    if (step !== undefined) next = (focusIndex + step + ITEMS.length) % ITEMS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = ITEMS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1"
    >
      {LAYOUT.map((group, g) => (
        <div key={g} className="flex items-center gap-0.5 border-line pr-1 not-last:border-r">
          {group.map(({ item, index }) => {
            const flags = state?.[index] ?? { active: false, enabled: true };
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                ref={(el) => {
                  refs.current[index] = el;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                onClick={() => flags.enabled && item.run(editor)}
                // aria-disabled rather than disabled keeps the button focusable,
                // so the toolbar's single tab stop never lands on a dead button.
                aria-disabled={!flags.enabled}
                aria-pressed={item.active ? flags.active : undefined}
                aria-label={item.label}
                aria-keyshortcuts={item.shortcut?.replace("Mod", "Control")}
                title={item.shortcut ? `${item.label} (${item.shortcut.replace("Mod", "Ctrl/⌘")})` : item.label}
                className={`inline-flex size-9 items-center justify-center rounded-md text-ink transition-colors hover:bg-surface-muted aria-disabled:opacity-40 ${
                  flags.active ? "bg-accent-soft text-accent" : ""
                }`}
              >
                <Icon aria-hidden className="size-4" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
