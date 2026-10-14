/**
 * Cursor colours. Each one keeps at least 4.5:1 contrast against white text,
 * which is what the caret labels use.
 */
export const PRESENCE_COLORS = [
  "#b42318",
  "#b54708",
  "#027a48",
  "#026aa2",
  "#5925dc",
  "#c11574",
  "#3e4784",
  "#0e7090",
] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorFor(id: string): string {
  return PRESENCE_COLORS[hash(id) % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0];
}

const ANIMALS = [
  "Otter", "Heron", "Lynx", "Marten", "Puffin", "Ibex", "Gecko", "Wren",
  "Bison", "Koala", "Narwhal", "Tapir", "Quokka", "Falcon", "Badger", "Orca",
];

export function guestNameFor(id: string): string {
  return `Guest ${ANIMALS[hash(id) % ANIMALS.length] ?? "Otter"}`;
}

/** Trim display names to something that fits in a caret label. */
export function displayName(name: string | null | undefined, fallback: string): string {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  return (clean || fallback).slice(0, 80);
}
