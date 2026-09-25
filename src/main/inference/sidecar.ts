// One managed `llama-server` child process. Owns its lifecycle (spawn, health poll, SIGTERM →
// SIGKILL) and broadcasts every state change so the UI never has to poll. Exactly one process
// per app run: a second start() on a live sidecar returns the current status instead of forking.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { MainContext } from "@main/context";
import { IPC } from "@shared/ipc";
import { APPLE_FM_BINARY, type SidecarConfig, type SidecarStatus } from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";

export const HEALTH_INTERVAL_MS = 500;
export const HEALTH_TIMEOUT_MS = 60_000;
export const KILL_GRACE_MS = 3000;
export const STDERR_LINES = 50;

const DOWNLOAD_HINT =
  "brew install llama.cpp, then download a .gguf " +
  "(e.g. https://huggingface.co/unsloth/Qwen3.5-4B-GGUF → ~/models/Qwen3.5-4B-Q4_K_M.gguf) " +
  "and set it as the sidecar modelPath";

const LICENSE_HINT =
  "Apple's on-device model needs its terms accepted once: run `sudo fm license` in Terminal, then start again.";

function isAppleFm(config: SidecarConfig): boolean {
  return config.binaryPath === APPLE_FM_BINARY;
}

function serverName(config: SidecarConfig): string {
  return isAppleFm(config) ? "fm serve" : "llama-server";
}

export function sidecarArgs(config: SidecarConfig): string[] {
  if (isAppleFm(config)) return ["serve", "--port", String(config.port)];
  return [
    "-m",
    config.modelPath,
    "--port",
    String(config.port),
    "-c",
    String(config.ctxSize),
    "--jinja",
    "--host",
    "127.0.0.1",
    "-ngl",
    "99",
  ];
}

export interface RingBuffer {
  push(chunk: string): void;
  lines(): string[];
  tail(count?: number): string;
  clear(): void;
}

/** Keeps only the last `capacity` non-empty lines so an error message stays readable. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export function createRingBuffer(capacity: number = STDERR_LINES): RingBuffer {
  let buffer: string[] = [];
  return {
    push(chunk) {
      for (const raw of chunk.split("\n")) {
        // CLIs colour their errors; the status panel shows plain text.
        const line = raw.replace(ANSI_COLOUR, "").trimEnd();
        if (line.length === 0) continue;
        buffer.push(line);
        if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
      }
    },
    lines: () => [...buffer],
    tail: (count = capacity) => buffer.slice(Math.max(0, buffer.length - count)).join("\n"),
    clear: () => {
      buffer = [];
    },
  };
}

export async function pollHealth(
  port: number,
  deadlineMs: number = HEALTH_TIMEOUT_MS,
  isAlive: () => boolean = () => true,
): Promise<Result<void>> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      return fail({
        code: "sidecar-exited",
        message: "The server exited before becoming ready.",
      });
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(HEALTH_INTERVAL_MS * 2),
      });
      if (response.ok) return ok(undefined);
    } catch {
      // Not listening yet; keep waiting until the deadline.
    }
    await delay(HEALTH_INTERVAL_MS);
  }
  return fail({
    code: "sidecar-timeout",
    message: `The server did not report healthy on :${port} within ${deadlineMs / 1000}s.`,
    hint: "check the model file size vs available RAM, or lower ctxSize",
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Sidecar {
  start(config: SidecarConfig | null): Promise<Result<SidecarStatus>>;
  stop(): Promise<Result<void>>;
  status(): SidecarStatus;
}

const STOPPED: SidecarStatus = { state: "stopped", pid: null, port: null, message: null };

export function createSidecar(ctx: MainContext): Sidecar {
  let status: SidecarStatus = { ...STOPPED };
  let child: ReturnType<typeof spawn> | null = null;
  const stderr = createRingBuffer();

  function setStatus(next: SidecarStatus): void {
    status = next;
    ctx.broadcast(IPC.inference.sidecarEvent, status);
  }

  async function start(config: SidecarConfig | null): Promise<Result<SidecarStatus>> {
    if (config === null) {
      return fail({
        code: "no-sidecar-config",
        message: "This provider has no sidecar configured.",
        hint: "switch to the llamacpp provider to manage a local llama-server",
      });
    }
    if (status.state === "starting" || status.state === "ready") return ok(status);

    if (config.binaryPath.length === 0 || !existsSync(config.binaryPath)) {
      return fail({
        code: "binary-missing",
        message: `${serverName(config)} not found at ${config.binaryPath || "(empty path)"}.`,
        hint: isAppleFm(config)
          ? "Apple Foundation Models needs macOS with Apple Intelligence; use the OpenAI preset otherwise."
          : DOWNLOAD_HINT,
      });
    }
    if (!isAppleFm(config) && (config.modelPath.length === 0 || !existsSync(config.modelPath))) {
      return fail({
        code: "model-missing",
        message: `No .gguf model at ${config.modelPath || "(empty path)"}.`,
        hint: DOWNLOAD_HINT,
      });
    }

    stderr.clear();
    setStatus({ state: "starting", pid: null, port: config.port, message: null });

    const proc = spawn(config.binaryPath, sidecarArgs(config), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => stderr.push(chunk));
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => stderr.push(chunk));

    let exited = false;
    proc.on("error", (e: Error) => {
      exited = true;
      stderr.push(e.message);
    });
    proc.on("exit", (code) => {
      exited = true;
      if (child === proc) child = null;
      if (status.state === "ready" || status.state === "starting") {
        setStatus({
          state: "error",
          pid: null,
          port: config.port,
          message: `${serverName(config)} exited with code ${String(code)}\n${stderr.tail(10)}${
            isAppleFm(config) && /AGREED|license/i.test(stderr.tail(10)) ? `\n${LICENSE_HINT}` : ""
          }`,
        });
      }
    });

    setStatus({ state: "starting", pid: proc.pid ?? null, port: config.port, message: null });
    const health = await pollHealth(config.port, HEALTH_TIMEOUT_MS, () => !exited);
    if (!health.ok) {
      const unlicensed = isAppleFm(config) && /AGREED|license/i.test(stderr.tail(10));
      const message = `${health.error.message}\n${stderr.tail(10)}${unlicensed ? `\n${LICENSE_HINT}` : ""}`;
      // Stop first: stopping reports "stopped", and the reason must be what stays on screen.
      await stop();
      setStatus({ state: "error", pid: null, port: config.port, message });
      return fail({ ...health.error, message });
    }
    setStatus({ state: "ready", pid: proc.pid ?? null, port: config.port, message: null });
    return ok(status);
  }

  async function stop(): Promise<Result<void>> {
    const proc = child;
    child = null;
    if (proc === null || proc.exitCode !== null || proc.killed) {
      setStatus({ ...STOPPED });
      return ok(undefined);
    }
    const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
    proc.kill("SIGTERM");
    const killer = setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE_MS);
    await exited;
    clearTimeout(killer);
    setStatus({ ...STOPPED });
    return ok(undefined);
  }

  ctx.onBeforeQuit(async () => {
    await stop();
  });

  return { start, stop, status: () => status };
}
