import { colorFor, guestNameFor } from "@syncscribe/shared/identity";

export interface TabIdentity {
  name: string;
  color: string;
}

/** Each tab gets its own guest name and colour, so two windows are easy to tell apart. */
export function createTabIdentity(seed: string = crypto.randomUUID()): TabIdentity {
  return { name: guestNameFor(seed), color: colorFor(seed) };
}
