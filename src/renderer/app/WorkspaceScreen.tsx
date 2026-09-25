import worldForgeArt from "@renderer/assets/generated/world-forge.png";
import { ScenePreviewCanvas } from "@renderer/engine";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { WorkspacePreview, WorkspaceRecord } from "@shared/cartridge";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useState } from "react";
import { GameShell } from "./shell/GameShell";
import { useKeys } from "./shell/useKeys";

const RULES_FILE = "rules.oui";

export function WorkspaceScreen() {
  const workspaceId = useSessionStore((state) => state.activeWorkspaceId);
  const setScreen = useSessionStore((state) => state.setScreen);
  const toast = useSessionStore((state) => state.toast);
  const [workspace, setWorkspace] = useState<Loadable<WorkspaceRecord>>(idle());
  const [sceneId, setSceneId] = useState("");
  const [source, setSource] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Loadable<WorkspacePreview>>(idle());

  useEffect(() => {
    if (workspaceId === null) {
      setScreen("worlds");
      return;
    }
    setWorkspace(loading());
    void window.seed.workspaces.read(workspaceId).then((result) => {
      if (!result.ok) return setWorkspace(errored(result.error));
      const initialId = RULES_FILE;
      setSceneId(initialId);
      setSource(result.value.rules);
      setWorkspace(ready(result.value));
    });
  }, [setScreen, workspaceId]);

  const save = useCallback(async (): Promise<boolean> => {
    if (workspaceId === null || sceneId === "") return false;
    setBusy(true);
    const result =
      sceneId === RULES_FILE
        ? await window.seed.workspaces.writeRules({ workspaceId, source })
        : await window.seed.workspaces.writeScene({ workspaceId, sceneId, source });
    setBusy(false);
    if (!result.ok) {
      toast("danger", result.error.message);
      return false;
    }
    setWorkspace((current) =>
      current.status === "ready"
        ? ready({
            ...current.value,
            meta: result.value,
            rules: sceneId === RULES_FILE ? source : current.value.rules,
            scenes:
              sceneId === RULES_FILE
                ? current.value.scenes
                : { ...current.value.scenes, [sceneId]: source },
          })
        : current,
    );
    toast("success", sceneId === RULES_FILE ? "rules.oui saved" : `${sceneId}.oui saved`);
    return true;
  }, [sceneId, source, toast, workspaceId]);

  const publish = useCallback(() => {
    if (workspaceId === null) return;
    void (async () => {
      if (!(await save())) return;
      setBusy(true);
      const result = await window.seed.workspaces.publish({ workspaceId, version });
      setBusy(false);
      if (!result.ok) return toast("danger", result.error.message);
      toast("success", `Published ${result.value.cartridgeId}@${result.value.version}`);
      setScreen("worlds");
    })();
  }, [save, setScreen, toast, version, workspaceId]);

  const runPreview = useCallback(() => {
    if (workspaceId === null) return;
    void (async () => {
      if (!(await save())) return;
      setPreview(loading());
      const result = await window.seed.workspaces.preview(workspaceId);
      setPreview(result.ok ? ready(result.value) : errored(result.error));
    })();
  }, [save, workspaceId]);

  const files = (record: WorkspaceRecord): { id: string; title: string }[] => [
    { id: RULES_FILE, title: "Rules" },
    ...record.meta.scenes.map((scene) => ({ id: scene.id, title: scene.title })),
  ];

  const openFile = (record: WorkspaceRecord, nextId: string): void => {
    setSceneId(nextId);
    setSource(nextId === RULES_FILE ? record.rules : (record.scenes[nextId] ?? ""));
  };

  useKeys({ Escape: () => setScreen("worlds") }, !busy);

  return (
    <GameShell
      art={worldForgeArt}
      hints={[{ keys: ["Esc"], label: "Back", onPress: () => setScreen("worlds") }]}
    >
      <StatePanel state={workspace} loadingText="Opening workspace…">
        {(record) => (
          <div className="ws">
            <div className="ws__col g-scroll">
              <h2 className="g-heading">Files</h2>
              {files(record).map((file) => (
                <Button
                  key={file.id}
                  variant="tile"
                  active={file.id === sceneId}
                  onClick={() => openFile(record, file.id)}
                  style={{ padding: "10px 14px" }}
                >
                  {file.title}
                </Button>
              ))}
            </div>
            <div className="ws__col">
              <span className="g-meta">
                {sceneId === RULES_FILE ? RULES_FILE : `${sceneId}.oui`}
              </span>
              <textarea
                aria-label="OpenUI source"
                className="ws__editor"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPreview(idle());
                }}
                spellCheck={false}
              />
            </div>
            <div className="ws__col">
              <h2 className="g-heading">{record.meta.name}</h2>
              <span className="g-meta">
                {`${record.meta.mode} · ${record.meta.base.cartridgeId}@${record.meta.base.version} → ${record.meta.targetCartridgeId}`}
              </span>
              <Button disabled={busy} onClick={() => void save()}>
                Save draft
              </Button>
              <Button disabled={busy} onClick={runPreview}>
                Validate & Preview
              </Button>
              {preview.status === "ready" ? (
                <>
                  {preview.value.checks.map((item) => (
                    <div key={item.id}>
                      <Text variant="caption" tone={item.ok ? "muted" : "danger"}>
                        {item.ok ? `✓ ${item.label}` : `✕ ${item.label}`}
                      </Text>
                      {item.messages.map((message) => (
                        <Text key={message} variant="caption" tone="danger">
                          {message}
                        </Text>
                      ))}
                    </div>
                  ))}
                  {preview.value.valid ? (
                    <div style={{ height: 260, minHeight: 260 }}>
                      <ScenePreviewCanvas
                        rulesSource={preview.value.workspace.rules}
                        sceneSource={
                          preview.value.workspace.scenes[sceneId] ??
                          preview.value.workspace.scenes[
                            preview.value.workspace.meta.entrySceneId
                          ] ??
                          ""
                        }
                      />
                    </div>
                  ) : null}
                </>
              ) : preview.status === "loading" ? (
                <Text variant="caption" tone="muted">
                  Validating every scene…
                </Text>
              ) : preview.status === "error" ? (
                <Text variant="caption" tone="danger">
                  {preview.error.message}
                </Text>
              ) : null}
              <TextField
                label="Version"
                mono
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
              <Button variant="primary" disabled={busy || version.trim() === ""} onClick={publish}>
                Publish
              </Button>
            </div>
          </div>
        )}
      </StatePanel>
    </GameShell>
  );
}
