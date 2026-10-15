# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository rather than in a public issue. I aim to reply within a week.

## Threat model

SyncScribe has three parts that trust each other in a fixed direction:

```
browser  --(session cookie)-->  web app (Next.js)  --(SQL)-->  Postgres
browser  --(signed token)--->   sync server        --(SQL)-->  Postgres
```

The browser is never trusted. The web app is the only component that turns a
session into an identity and a role. The sync server trusts nothing the
browser says except a token the web app signed in the last two minutes, and it
re-checks that token's role against Postgres.

| Threat | What stops it |
| --- | --- |
| Calling a server action directly with someone else's document id | Every action and route handler calls `requireDocAccess(docId, action)`, which reads the caller's role from `document_members` for the session user. Strangers get "not found" so ids cannot be probed. |
| Forging a role or user id in a request body | Inputs are parsed with strict zod objects that reject unknown keys. Identity comes only from the server-side session. |
| Viewer edits through a modified client | The sync server opens viewer connections read-only and discards their document updates. Tested in `apps/sync/test/websocket-auth.test.ts`. |
| Reusing or tampering with a websocket token | HS256 JWT with issuer, audience, 120 s expiry and a document claim, verified with an algorithm allow-list. The server takes the weaker of the token role and the current database role. |
| Keeping access after being removed | Membership changes send `pg_notify`; the sync server closes those sockets and the client must fetch a new token, which the web app refuses. |
| Finding out who has an account (user enumeration) | Sharing always stores a pending invite and returns the same message. The invite turns into membership only when someone signs in with that verified email. |
| Claiming someone else's invite | Only verified GitHub emails are stored, so an attacker cannot add a victim's address to their GitHub account and inherit their invites. |
| Spoofed presence (showing up as another user) | The sync server overwrites the `user` field of every awareness update with the identity from the token. |
| Guest sandbox reaching private documents | Guest tokens are scoped to the `sandbox:` namespace; private documents live under `doc:<uuid>`. Both the signer and the verifier enforce this. |
| Cross-site requests | Server actions are protected by Next's origin check; token-minting route handlers check `Origin` too. Session cookies are `SameSite=Lax` and `HttpOnly`. The sync server rejects websocket upgrades from unknown origins. |
| Script injection | Nonce-based Content-Security-Policy with `strict-dynamic`, no inline scripts, `frame-ancestors 'none'`, `object-src 'none'`. Markdown export drops links that are not http, https or mailto. |
| Abuse and flooding | Postgres-backed rate limits on sharing, document creation and sandbox tokens; a per-address limit on websocket upgrades; a size cap and periodic reset for the sandbox; Hocuspocus limits on unauthenticated message queues. |
| Middleware bypass (CVE-2025-29927 class) | The proxy only sets headers. No authorization decision lives there. |
| Leaked OAuth tokens | GitHub access and refresh tokens are dropped before they reach the database. The app never calls GitHub after sign-in. |

## How authorization works

Roles are `owner`, `editor` and `viewer`. The rules live in one file,
[`packages/shared/src/roles.ts`](packages/shared/src/roles.ts), and both the web
app and the sync server import it.

- `ACTIONS` maps each action (for example `doc.rename`) to the lowest role
  allowed to perform it.
- `requireDocAccess(docId, action)` in
  [`apps/web/src/server/access.ts`](apps/web/src/server/access.ts) validates the
  id, loads the session user, reads their role from the database and compares
  it with `ACTIONS[action]`.
- Rules that depend on the target as well as the actor (`canGrant`,
  `canChangeRole`, `canRemoveMember`, `canTransferTo`) are separate functions
  with their own tests.
- Postgres enforces "exactly one owner per document" with a partial unique
  index, so even a bug in application code cannot create a second owner.

The full matrix is in the README and is pinned by
`packages/shared/test/roles.test.ts`.

## The static demo

`apps/demo`, published to GitHub Pages, has no server, accounts or shared
documents. Each visitor's documents stay in their own browser, so the threats
above (forged roles, stolen sessions, other users' documents) do not exist
there. What it does guard against:

| Threat | What stops it |
| --- | --- |
| Another page on the same origin reading or poisoning demo data | All of an account's GitHub Pages project sites share one origin. Keys, databases and channels are prefixed `syncscribe-demo:`, and everything read back (document list, stored versions, BroadcastChannel messages, remote presence) is validated against the exact shapes the demo writes. Invalid entries are dropped one by one. |
| Corrupt or hostile Yjs bytes | Updates that fail to decode are discarded without touching the document. Remote presence is decoded, reduced to a checked name, colour and cursor, and re-encoded before the editor sees it. |
| Script injection | A CSP meta tag with `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'none'`. No inline scripts or styles and no eval: carets are coloured through the CSSOM and zod runs without code generation. |
| Data leaving the browser | The page only requests its own files from its own origin, and never sends document content anywhere. The e2e suite fails if any request goes to another host. |

GitHub Pages cannot send response headers, and `frame-ancestors` is ignored
in a meta tag, so the demo can be framed by another site. It holds no
credentials or private data, so there is nothing for a clickjacking attack to
reach.

## Out of scope / known gaps

- The demo's "Open as viewer" tab only previews the read-only UI. Nothing
  stops a modified client in that tab from writing, because there is no
  server to refuse it. The full app enforces this on the sync server.

- The sandbox is public by design. Do not type anything private there.
- Rate limits are per user or per address and are not a defence against a
  distributed attack.
- Exports reflect the last persisted state, which can trail live edits by a
  few seconds.
