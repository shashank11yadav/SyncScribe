export type AccessErrorCode = "unauthenticated" | "not_found" | "forbidden";

/**
 * Thrown by the access helpers. A stranger gets "not_found" rather than
 * "forbidden" so document ids cannot be probed for existence.
 */
export class AccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super(code);
    this.name = "AccessError";
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate_limited");
    this.name = "RateLimitError";
  }
}

/** A rule violation the user can act on, with a message that is safe to show. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
