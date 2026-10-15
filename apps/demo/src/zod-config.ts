import { z } from "zod";

// Zod compiles object parsers with new Function unless told not to. The CSP has
// no 'unsafe-eval', and even zod's guarded probe shows up as a violation, so
// this module is imported before anything that defines a schema.
z.config({ jitless: true });
