type Level = "info" | "warn" | "error";

/** One JSON object per line so hosted log viewers can filter on fields. */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (process.env.SYNC_QUIET === "1" && level === "info") return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
