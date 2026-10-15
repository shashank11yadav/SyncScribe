/**
 * Every key, database and channel name the demo uses. On github.io all of a
 * user's project sites share one origin, so storage is namespaced and
 * everything read back is validated as if another page could have written it.
 */
export const PREFIX = "syncscribe-demo";

export const DOCUMENTS_KEY = `${PREFIX}:documents:v1`;
export const SEEDED_KEY = `${PREFIX}:seeded:v1`;
export const HISTORY_DB = `${PREFIX}:history`;
export const CONTROL_CHANNEL = `${PREFIX}:control`;

export function docStorageName(docId: string): string {
  return `${PREFIX}:doc:${docId}`;
}

export function docChannelName(docId: string): string {
  return `${PREFIX}:doc:${docId}`;
}
