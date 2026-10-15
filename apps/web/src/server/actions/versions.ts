"use server";

import { documentVersions } from "@syncscribe/db";
import { docRefInput } from "@syncscribe/shared";
import { requireDocAccess } from "../access";
import { getDb } from "../db";
import { UserFacingError } from "../errors";
import { getDocumentState } from "../queries";
import { runAction, type ActionResult } from "../result";

/**
 * Saves the last persisted state as a named version. The editor calls this
 * right before a restore so the restore itself can always be undone.
 */
export async function createSnapshot(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { docId } = docRefInput.parse(input);
    const { user } = await requireDocAccess(docId, "doc.snapshot");
    const state = await getDocumentState(docId);
    if (!state || state.byteLength === 0) throw new UserFacingError("Nothing to save yet. Type something first.");
    const [row] = await getDb()
      .insert(documentVersions)
      .values({ documentId: docId, state, kind: "manual", createdBy: user.id })
      .returning({ id: documentVersions.id });
    return { id: row!.id };
  });
}
