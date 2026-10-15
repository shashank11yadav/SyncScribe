/**
 * The plain UI pieces, without Tiptap, ProseMirror or Yjs. Pages that do not
 * show an editor import from here so a bundler can leave the editor out.
 */
export { Avatar } from "./ui/Avatar";
export { Button, buttonClasses } from "./ui/Button";
export { Dialog } from "./ui/Dialog";
export { RoleBadge } from "./ui/RoleBadge";
export { EditorSkeleton, ReadOnlyNotice } from "./ui/Placeholders";
export { PeerAvatars } from "./PeerAvatars";
export { peerFromState, peersFromStates, type PeerPresence } from "./presence";
export { timeAgo } from "./format";
