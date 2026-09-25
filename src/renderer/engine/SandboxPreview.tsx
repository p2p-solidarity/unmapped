import { useEffect, useRef } from "react";

/** A separate renderer realm owns every playtest store; it never loads persistence hooks. */
export function SandboxPreview({
  sceneSource,
  rulesSource,
}: {
  sceneSource: string;
  rulesSource: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const url = new URL(window.location.href);
  url.searchParams.set("sandbox", "1");
  useEffect(() => {
    const send = () =>
      frame.current?.contentWindow?.postMessage(
        { type: "aether-sandbox-load", sceneSource, rulesSource },
        window.location.protocol === "file:" ? "*" : window.location.origin,
      );
    const ready = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === "aether-sandbox-ready"
      )
        send();
    };
    window.addEventListener("message", ready);
    send();
    return () => window.removeEventListener("message", ready);
  }, [sceneSource, rulesSource]);
  return (
    <iframe
      ref={frame}
      src={url.href}
      title="Isolated scene playtest"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      style={{ width: "100%", height: "100%", border: 0 }}
    />
  );
}
