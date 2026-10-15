import { CONTROL_CHANNEL } from "./keys";
import { parseControlMessage, type ControlMessage } from "./messages";

/**
 * Demo-wide notices between tabs: a document was deleted, or its history
 * changed. The document list itself syncs through the storage event.
 */
export function openControlChannel(onMessage: (message: ControlMessage) => void): {
  post: (message: ControlMessage) => void;
  close: () => void;
} {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CONTROL_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const message = parseControlMessage(event.data);
      if (message) onMessage(message);
    };
  } catch {
    channel = null;
  }
  return {
    post: (message) => {
      try {
        channel?.postMessage(message);
      } catch {
        // Closed during unload.
      }
    },
    close: () => channel?.close(),
  };
}
