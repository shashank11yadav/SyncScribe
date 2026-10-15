import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { parseDocMessage, sanitizeAwarenessUpdate, type DocMessage } from "./messages";

/** An empty Yjs update: no structs, empty delete set. Not worth posting. */
const EMPTY_UPDATE_BYTES = 2;

/**
 * Syncs one Y.Doc and its awareness between tabs of the same browser over a
 * BroadcastChannel. There is no server: every tab holds the full document,
 * and Yjs merges whatever arrives in any order.
 *
 * On connect a tab sends its state vector (peers answer with what it is
 * missing), its full state (so peers get what they are missing), and asks
 * every peer to repeat its presence.
 */
export class BroadcastProvider {
  readonly awareness: Awareness;
  /** Messages that failed validation or could not be applied. Exposed for tests. */
  rejected = 0;
  private channel: BroadcastChannel | null = null;
  private parkedState: Record<string, unknown> | null = null;

  constructor(
    readonly doc: Y.Doc,
    readonly channelName: string,
  ) {
    this.awareness = new Awareness(doc);
  }

  get connected(): boolean {
    return this.channel !== null;
  }

  connect(): void {
    if (this.channel) return;
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.addEventListener("message", this.onMessage);
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("pageshow", this.onPageShow);
    }

    this.post({ type: "sync-request", stateVector: Y.encodeStateVector(this.doc) });
    const state = Y.encodeStateAsUpdate(this.doc);
    if (state.byteLength > EMPTY_UPDATE_BYTES) this.post({ type: "update", update: state });
    this.post({ type: "awareness-query" });
    this.postOwnAwareness();
  }

  destroy(): void {
    if (this.channel) {
      // Tell peers this tab left now, instead of letting its caret linger for 30 seconds.
      removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
      this.doc.off("update", this.onDocUpdate);
      this.awareness.off("update", this.onAwarenessUpdate);
      this.channel.removeEventListener("message", this.onMessage);
      this.channel.close();
      this.channel = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("pageshow", this.onPageShow);
    }
    this.awareness.destroy();
  }

  private post(message: DocMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // The channel was closed by the browser (page unloading). Nothing to recover.
    }
  }

  private postOwnAwareness(): void {
    if (this.awareness.getLocalState() === null) return;
    this.post({ type: "awareness", update: encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) });
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this) this.post({ type: "update", update });
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    // Only this tab's own changes go out. Remote states and timeouts stay local.
    if (origin !== "local") return;
    const changed = [...added, ...updated, ...removed];
    this.post({ type: "awareness", update: encodeAwarenessUpdate(this.awareness, changed) });
  };

  private onMessage = (event: MessageEvent) => {
    const message = parseDocMessage(event.data);
    if (!message) {
      this.rejected++;
      return;
    }
    try {
      this.handle(message);
    } catch {
      // A structurally valid message with corrupt Yjs bytes. Drop it and keep going.
      this.rejected++;
    }
  };

  private handle(message: DocMessage): void {
    switch (message.type) {
      case "sync-request": {
        const missing = Y.encodeStateAsUpdate(this.doc, message.stateVector);
        if (missing.byteLength > EMPTY_UPDATE_BYTES) this.post({ type: "update", update: missing });
        return;
      }
      case "update":
        Y.applyUpdate(this.doc, message.update, this);
        return;
      case "awareness": {
        const clean = sanitizeAwarenessUpdate(message.update);
        if (!clean) {
          this.rejected++;
          return;
        }
        applyAwarenessUpdate(this.awareness, clean, this);
        return;
      }
      case "awareness-query":
        this.postOwnAwareness();
        return;
    }
  }

  // A page going into the back/forward cache stays alive but should not look present.
  private onPageHide = () => {
    this.parkedState = this.awareness.getLocalState();
    if (this.parkedState) removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
  };

  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && this.parkedState) this.awareness.setLocalState(this.parkedState);
    this.parkedState = null;
  };
}
