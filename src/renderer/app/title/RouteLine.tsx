// Where the next model call goes, said before any call is made (rev 6 phase 4, D2): this computer,
// the provider with the player's own key (saved or from .env), or the gateway's free allowance —
// and which model runs there. Main decides (`routeFor`); this only reads its answer.

import { errorLine, type Translate, useT } from "@renderer/i18n";
import { Text } from "@renderer/ui";
import type { ProviderKind, RouteView } from "@shared/llm";
import type { Loadable } from "@shared/result";
import type { JSX } from "react";

export function kindLabel(kind: ProviderKind, t: Translate): string {
  switch (kind) {
    case "apple-fm":
      return t("model.apple");
    case "llamacpp":
      return t("model.llama");
    case "ollama":
      return t("model.ollama");
    case "custom":
      return t("model.custom");
    case "hosted":
      return t("model.hosted");
    case "openai":
      return "OpenAI";
    case "openui-gateway":
      return "OpenUI Gateway";
    case "vllm":
      return "vLLM";
  }
}

function describe(view: RouteView, t: Translate): string {
  const next = view.next;
  if (next === null) {
    return t("model.routeNone", { reason: view.error === null ? "—" : errorLine(view.error) });
  }
  const model = next.model || "—";
  if (next.route === "hosted") {
    return next.via === "no-own-key"
      ? t("model.routeNoKeyAllowance", { kind: kindLabel(view.selected.kind, t), model })
      : t("model.routeAllowance", { model });
  }
  const kind = kindLabel(next.kind, t);
  if (next.route === "local") return t("model.routeLocal", { kind, model });
  if (next.keySource === "saved") return t("model.routeSaved", { kind, model });
  if (next.keySource === "env") return t("model.routeEnv", { kind, model });
  return t("model.routeKeyless", { kind, model });
}

export function RouteLine({ route }: { route: Loadable<RouteView> }): JSX.Element | null {
  const t = useT();
  if (route.status === "idle") return null;
  if (route.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {t("model.routeChecking")}
      </Text>
    );
  }
  if (route.status === "error") {
    return (
      <Text variant="caption" tone="danger">
        {errorLine(route.error)}
      </Text>
    );
  }
  return (
    <div data-route={route.value.next?.route ?? "none"}>
      <Text variant="caption" tone={route.value.next === null ? "danger" : "default"}>
        {describe(route.value, t)}
      </Text>
    </div>
  );
}
