// The think filter lives in @shared/chatWire (rev 6 phase 4, D2), so main and the gateway run one
// copy. Kept here as a re-export for main's callers.

export { createThinkFilter, stripThinking, type ThinkFilter } from "@shared/chatWire";
