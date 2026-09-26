// world.oui in a text box. The parser is the only judge: "Apply" either produces a SceneGraph and
// writes the file, or shows exactly what the DSL rejected (Rule 7 — no partial application).

import { type DslError, parseScene, serializeScene } from "@dsl/index";
import { errorLine, useT } from "@renderer/i18n";
import { currentKey, exportEncryptedSeed, importEncryptedSeed } from "@renderer/identity";
import { useSessionStore, useWorldStore } from "@renderer/state";
import { Button, colors, font, radius, Surface, space, Text } from "@renderer/ui";
import { errored, ready } from "@shared/result";
import { WORLD_FILES } from "@shared/world";
import { useCallback, useEffect, useRef, useState } from "react";
import { openWorld } from "../useWorldLoader";

interface Issue {
  statementId: string | null;
  message: string;
  hint: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The parser's error type comes from @openuidev/lang-core; read it structurally. */
function toIssue(raw: unknown): Issue {
  if (typeof raw === "string") return { statementId: null, message: raw, hint: null };
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    return {
      statementId: asString(record.statementId) ?? asString(record.id),
      message: asString(record.message) ?? JSON.stringify(raw),
      hint: asString(record.hint),
    };
  }
  return { statementId: null, message: String(raw), hint: null };
}

function IssueList({ error }: { error: DslError }) {
  const t = useT();
  const issues = error.errors.map((raw, position) => {
    const issue = toIssue(raw);
    return { ...issue, key: `${issue.statementId ?? "stmt"}-${position}` };
  });
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="danger">
        {t("console.issueCount", { code: error.code, n: issues.length })}
      </Text>
      {issues.map((issue) => (
        <div key={issue.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Text variant="caption" mono tone="accent">
            {issue.statementId ?? t("console.noStatementId")}
          </Text>
          <Text variant="caption">{issue.message}</Text>
          {issue.hint === null ? null : (
            <Text variant="caption" tone="muted">
              {issue.hint}
            </Text>
          )}
        </div>
      ))}
      {error.unresolved.length > 0 ? (
        <Text variant="caption" tone="muted">
          {t("console.unresolved", { list: error.unresolved.join(", ") })}
        </Text>
      ) : null}
      {error.orphaned.length > 0 ? (
        <Text variant="caption" tone="muted">
          {t("console.orphaned", { list: error.orphaned.join(", ") })}
        </Text>
      ) : null}
    </Surface>
  );
}

export function WorldTab() {
  const sceneSource = useWorldStore((state) => state.sceneSource);
  const setScene = useWorldStore((state) => state.setScene);
  // Legacy worlds own world.oui; a cartridge instance plays a published, immutable scene.
  const worldId = useWorldStore((state) =>
    state.origin?.kind === "legacy" ? state.origin.worldId : null,
  );
  const immutable = useWorldStore((state) => state.origin?.kind === "instance");
  const toast = useSessionStore((state) => state.toast);
  const unlock = useSessionStore((state) => state.unlock);
  const t = useT();

  const [draft, setDraft] = useState(sceneSource);
  const [issues, setIssues] = useState<DslError | null>(null);
  const applied = useRef(sceneSource);

  // A hot reload (or an Apply from elsewhere) replaces the editor content.
  useEffect(() => {
    if (applied.current !== sceneSource) {
      applied.current = sceneSource;
      setDraft(sceneSource);
      setIssues(null);
    }
  }, [sceneSource]);

  const apply = useCallback(() => {
    if (immutable) {
      toast("danger", t("console.sceneImmutable"));
      return;
    }
    const parsed = parseScene(draft);
    if (!parsed.ok) {
      setIssues(parsed.error);
      return;
    }
    setIssues(null);
    applied.current = draft;
    setScene(draft, ready(parsed.value));
    if (worldId === null) {
      toast("danger", t("console.noWorldLoaded"));
      return;
    }
    void (async () => {
      const written = await window.seed.worlds.write(worldId, WORLD_FILES.scene, draft);
      if (written.ok) toast("success", t("console.sceneApplied"));
      else toast("danger", errorLine(written.error));
    })();
  }, [draft, immutable, setScene, t, toast, worldId]);

  // Normalises hand edits through the same writer the platform editor bakes with, so a file the
  // player typed and a file the editor produced are byte-identical for the same program.
  const format = useCallback(() => {
    const parsed = parseScene(draft);
    if (!parsed.ok) {
      setIssues(parsed.error);
      return;
    }
    setIssues(null);
    setDraft(serializeScene(parsed.value));
  }, [draft]);

  const reload = useCallback(() => {
    if (worldId === null) return;
    void (async () => {
      const result = await window.seed.worlds.read(worldId, WORLD_FILES.scene);
      if (!result.ok) {
        toast("danger", errorLine(result.error));
        return;
      }
      applied.current = result.value;
      setDraft(result.value);
      const parsed = parseScene(result.value);
      setScene(result.value, parsed.ok ? ready(parsed.value) : errored(parsed.error));
      setIssues(parsed.ok ? null : parsed.error);
    })();
  }, [setScene, toast, worldId]);

  const exportSeed = useCallback(() => {
    if (worldId === null) return;
    void (async () => {
      const result = await window.seed.worlds.exportSeed(worldId);
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", errorLine(result.error));
        return;
      }
      toast("success", t("console.exportedTo", { path: result.value.path }));
    })();
  }, [t, toast, worldId]);

  const exportEncrypted = useCallback(() => {
    const key = currentKey();
    if (worldId === null || key === null) {
      toast("danger", t("console.unlockBeforeExport"));
      return;
    }
    void (async () => {
      const result = await exportEncryptedSeed(worldId, key);
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", errorLine(result.error));
        return;
      }
      if (result.value !== null)
        toast("success", t("console.encryptedExportedTo", { path: result.value.path }));
    })();
  }, [t, toast, worldId]);

  const importEncrypted = useCallback(() => {
    const key = currentKey();
    if (key === null) {
      toast("danger", t("console.unlockBeforeImport"));
      return;
    }
    void (async () => {
      const result = await importEncryptedSeed(key);
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", errorLine(result.error));
        return;
      }
      if (result.value === null) return;
      toast("success", t("identity.restored", { name: result.value.name }));
      await openWorld(result.value.id);
    })();
  }, [t, toast]);

  const dirty = draft !== sceneSource;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="muted">
          {immutable ? t("console.publishedScene") : "world.oui"}
        </Text>
        <Text variant="caption" tone={immutable ? "dim" : dirty ? "accent" : "dim"}>
          {immutable
            ? t("console.readOnly")
            : dirty
              ? t("console.unsavedEdits")
              : t("console.inSync")}
        </Text>
      </div>

      {immutable ? (
        <Text variant="caption" tone="muted">
          {t("console.immutableNote")}
        </Text>
      ) : null}

      <textarea
        value={draft}
        readOnly={immutable}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        style={{
          minHeight: 280,
          resize: "vertical",
          padding: space.md,
          borderRadius: radius.md,
          border: `1px solid ${colors.surfaceBorder}`,
          background: colors.bg,
          color: colors.text,
          fontFamily: font.mono,
          fontSize: font.size.caption,
          lineHeight: 1.5,
        }}
      />

      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={apply} disabled={immutable}>
          {t("common.apply")}
        </Button>
        <Button onClick={format}>{t("console.format")}</Button>
        <Button onClick={reload} disabled={worldId === null}>
          {t("console.reloadFromDisk")}
        </Button>
        <Button variant="ghost" onClick={exportSeed} disabled={worldId === null}>
          {t("console.exportSeed")}
        </Button>
        <Button
          variant="ghost"
          onClick={exportEncrypted}
          disabled={worldId === null || unlock === null}
        >
          {t("console.exportSeedEnc")}
        </Button>
        <Button variant="ghost" onClick={importEncrypted} disabled={unlock === null}>
          {t("console.importSeedEnc")}
        </Button>
      </div>

      <Text variant="caption" tone="dim">
        {unlock?.method === "keychain"
          ? t("console.seedKeychainNote")
          : t("console.seedPasskeyNote")}
      </Text>

      {issues === null ? null : <IssueList error={issues} />}
    </>
  );
}
