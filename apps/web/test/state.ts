import { createDb } from "@syncscribe/db";
import { testDatabaseUrl } from "../../../test/env";

/** Mutable test state shared between the mocks in setup.ts and the tests. */
export const session = { user: null as null | { id: string; name: string; email: string | null } };
export const requestHeaders = { current: new Headers() };
export const cookieJar = new Map<string, string>();
export const handle = createDb(testDatabaseUrl(), { max: 4 });
