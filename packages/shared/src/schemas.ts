import { z } from "zod";
import { ROLES, SHARE_ROLES } from "./roles";

export const roleSchema = z.enum(ROLES);
export const shareRoleSchema = z.enum(SHARE_ROLES);

export const docIdSchema = z.uuid({ version: "v4" });

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title cannot be empty")
  .max(120, "Title is too long");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

// Every action input is strict: unknown keys such as a forged `role` or
// `userId` fail validation instead of being silently passed along.
export const createDocInput = z.strictObject({
  title: titleSchema.optional(),
});

export const renameDocInput = z.strictObject({
  docId: docIdSchema,
  title: titleSchema,
});

export const docRefInput = z.strictObject({
  docId: docIdSchema,
});

export const shareDocInput = z.strictObject({
  docId: docIdSchema,
  email: emailSchema,
  role: shareRoleSchema,
});

export const changeRoleInput = z.strictObject({
  docId: docIdSchema,
  userId: z.string().min(1).max(64),
  role: shareRoleSchema,
});

export const memberRefInput = z.strictObject({
  docId: docIdSchema,
  userId: z.string().min(1).max(64),
});

export const inviteRefInput = z.strictObject({
  docId: docIdSchema,
  inviteId: z.uuid(),
});

export const versionRefInput = z.strictObject({
  docId: docIdSchema,
  versionId: z.uuid(),
});

export type CreateDocInput = z.infer<typeof createDocInput>;
export type RenameDocInput = z.infer<typeof renameDocInput>;
export type ShareDocInput = z.infer<typeof shareDocInput>;
export type ChangeRoleInput = z.infer<typeof changeRoleInput>;
export type MemberRefInput = z.infer<typeof memberRefInput>;
