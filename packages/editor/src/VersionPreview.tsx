"use client";

import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/** A read-only render of one saved version, outside the live document. */
export function VersionPreview({ content }: { content: JSONContent }) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      injectCSS: false,
      editable: false,
      extensions: [StarterKit],
      content,
      editorProps: { attributes: { class: "prose-doc !min-h-0", "aria-label": "Version preview", role: "document" } },
    },
    [content],
  );
  return <EditorContent editor={editor} />;
}
