// Transient messages. Nothing here blocks the game: the stack is pointer-transparent and every
// toast dismisses itself after 4 s.

import { type Toast, useSessionStore } from "@renderer/state";
import { colors, Surface, space, Text, zIndex } from "@renderer/ui";
import { useEffect } from "react";

const DISMISS_MS = 4000;

const toneColor: Record<Toast["tone"], string> = {
  info: colors.info,
  success: colors.success,
  danger: colors.danger,
};

const toneText: Record<Toast["tone"], "default" | "success" | "danger"> = {
  info: "default",
  success: "success",
  danger: "danger",
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useSessionStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismissToast]);

  return (
    <Surface
      variant="overlay"
      padding="md"
      style={{ borderLeft: `3px solid ${toneColor[toast.tone]}`, maxWidth: 420 }}
    >
      <Text variant="body" tone={toneText[toast.tone]}>
        {toast.text}
      </Text>
    </Surface>
  );
}

export function Toasts() {
  const toasts = useSessionStore((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        right: space.lg,
        bottom: space.lg,
        display: "flex",
        flexDirection: "column",
        gap: space.sm,
        alignItems: "flex-end",
        pointerEvents: "none",
        zIndex: zIndex.toast,
      }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
