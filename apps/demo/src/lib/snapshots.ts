/** How often a tab that has been typing saves an automatic version. */
export const AUTO_SNAPSHOT_MS = 2 * 60 * 1000;

/**
 * Only the tab that made the edits takes automatic snapshots, so several open
 * tabs do not each save the same version.
 */
export function shouldAutoSnapshot(state: { dirty: boolean; lastSavedAt: number; now: number }, interval = AUTO_SNAPSHOT_MS): boolean {
  return state.dirty && state.now - state.lastSavedAt >= interval;
}
