import type { SeedBlock } from "@syncscribe/shared/sandbox-seed";

export const WELCOME_TITLE = "Welcome to SyncScribe";

export const WELCOME_SEED: SeedBlock[] = [
  { type: "heading", level: 1, inline: ["Welcome to the SyncScribe demo"] },
  {
    type: "paragraph",
    inline: [
      "This copy of the editor runs entirely in your browser. Documents are saved in IndexedDB, and edits travel between your open tabs over a BroadcastChannel. Nothing is sent to a server.",
    ],
  },
  { type: "heading", level: 2, inline: ["Things to try"] },
  {
    type: "bulletList",
    items: [
      ["Click ", { text: "Open in a new tab", marks: { bold: {} } }, " and type in both windows. Each cursor carries a name."],
      ["Use the toolbar or ", { text: "Markdown shortcuts", marks: { bold: {} } }, " like ", { text: "## ", marks: { code: {} } }, " and ", { text: "- ", marks: { code: {} } }, "."],
      ["Save a version from ", { text: "History", marks: { bold: {} } }, ", change some text, then restore it."],
      ["Open a viewer tab to see what someone with read-only access gets."],
    ],
  },
  {
    type: "paragraph",
    inline: [
      "Sign-in, sharing by email and permissions enforced by a server are part of the full app, which you can run locally from the README.",
    ],
  },
];
