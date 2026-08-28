/**
 * vite-server-control-plugin.ts
 *
 * A Vite dev-server middleware plugin that manages the AI server and MediaMTX
 * streaming server as child processes.  Exposes REST endpoints at /api/launcher/*
 * so the frontend can start / stop both servers without touching a terminal.
 *
 * Only active during `npm run dev`.  The plugin is a no-op in production builds.
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type { Plugin, Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

// == Process handles ==
let aiProcess: ChildProcess | null = null;
let streamProcess: ChildProcess | null = null;
let aiStartedAt: Date | null = null;
let streamStartedAt: Date | null = null;

const ROOT = path.resolve(__dirname);
const VENV_PYTHON = path.join(ROOT, ".venv", "Scripts", "python.exe");
const AI_MAIN = path.join(ROOT, "ai-server", "main.py");
const MEDIAMTX_EXE = path.join(ROOT, "streaming-server", "mediamtx.exe");
const MEDIAMTX_YML = path.join(ROOT, "streaming-server", "mediamtx.yml");
const MEDIAMTX_DIR = path.join(ROOT, "streaming-server");

// == Helpers ==

function isAlive(proc: ChildProcess | null): boolean {
  if (!proc) return false;
  try {
    return proc.exitCode === null && proc.signalCode === null;
  } catch {
    return false;
  }
}

function uptimeSeconds(since: Date | null): number | null {
  if (!since) return null;
  return Math.floor((Date.now() - since.getTime()) / 1000);
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

function cleanupProcess(proc: ChildProcess | null, name: string): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || !isAlive(proc)) { resolve(); return; }
    console.log(`[Launcher] Stopping ${name} (PID ${proc.pid})...`);
    proc.once("exit", () => resolve());
    proc.kill("SIGTERM");
    setTimeout(() => { if (isAlive(proc)) proc.kill("SIGKILL"); resolve(); }, 5000);
  });
}

// == Launcher actions ==

async function startAI(): Promise<{ ok: boolean; message: string; pid?: number }> {
  if (isAlive(aiProcess)) {
    return { ok: true, message: `AI server already running (PID ${aiProcess!.pid})` };
  }
  if (!fs.existsSync(VENV_PYTHON)) {
    return { ok: false, message: `Python venv not found at: ${VENV_PYTHON}` };
  }
  if (!fs.existsSync(AI_MAIN)) {
    return { ok: false, message: `ai-server/main.py not found at: ${AI_MAIN}` };
  }
  console.log("[Launcher] Starting AI server...");
  aiProcess = spawn(VENV_PYTHON, ["-u", AI_MAIN], {
    cwd: path.join(ROOT, "ai-server"),
    stdio: "pipe",
    detached: false,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  aiStartedAt = new Date();
  aiProcess.stdout?.on("data", (d: Buffer) => process.stdout.write(`[AI] ${d.toString()}`));
  aiProcess.stderr?.on("data", (d: Buffer) => process.stderr.write(`[AI] ${d.toString()}`));
  aiProcess.once("exit", (code) => {
    console.log(`[Launcher] AI server exited (code ${code})`);
    aiProcess = null;
    aiStartedAt = null;
  });
  return { ok: true, message: "AI server starting...", pid: aiProcess.pid };
}

async function stopAI(): Promise<{ ok: boolean; message: string }> {
  if (!isAlive(aiProcess)) return { ok: true, message: "AI server is not running." };
  await cleanupProcess(aiProcess, "AI server");
  aiProcess = null;
  aiStartedAt = null;
  return { ok: true, message: "AI server stopped." };
}

async function startStream(): Promise<{ ok: boolean; message: string; pid?: number }> {
  if (isAlive(streamProcess)) {
    return { ok: true, message: `Streaming server already running (PID ${streamProcess!.pid})` };
  }
  if (!fs.existsSync(MEDIAMTX_EXE)) {
    return { ok: false, message: `mediamtx.exe not found at: ${MEDIAMTX_EXE}` };
  }
  console.log("[Launcher] Starting MediaMTX streaming server...");
  const args = fs.existsSync(MEDIAMTX_YML) ? [MEDIAMTX_YML] : [];
  streamProcess = spawn(MEDIAMTX_EXE, args, {
    cwd: MEDIAMTX_DIR,
    stdio: "pipe",
    detached: false,
  });
  streamStartedAt = new Date();
  streamProcess.stdout?.on("data", (d: Buffer) => process.stdout.write(`[MTX] ${d.toString()}`));
  streamProcess.stderr?.on("data", (d: Buffer) => process.stderr.write(`[MTX] ${d.toString()}`));
  streamProcess.once("exit", (code) => {
    console.log(`[Launcher] MediaMTX exited (code ${code})`);
    streamProcess = null;
    streamStartedAt = null;
  });
  return { ok: true, message: "Streaming server starting...", pid: streamProcess.pid };
}

async function stopStream(): Promise<{ ok: boolean; message: string }> {
  if (!isAlive(streamProcess)) return { ok: true, message: "Streaming server is not running." };
  await cleanupProcess(streamProcess, "Streaming server");
  streamProcess = null;
  streamStartedAt = null;
  return { ok: true, message: "Streaming server stopped." };
}

function getStatus() {
  return {
    aiServer: {
      status: isAlive(aiProcess) ? "running" : "stopped",
      pid: isAlive(aiProcess) ? aiProcess!.pid : null,
      uptime: uptimeSeconds(aiStartedAt),
    },
    streaming: {
      status: isAlive(streamProcess) ? "running" : "stopped",
      pid: isAlive(streamProcess) ? streamProcess!.pid : null,
      uptime: uptimeSeconds(streamStartedAt),
    },
  };
}

async function handleLauncherRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? "";
  if (!url.startsWith("/api/launcher")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    res.end();
    return true;
  }

  if (url === "/api/launcher/status" && req.method === "GET") { jsonResponse(res, 200, getStatus()); return true; }
  if (url === "/api/launcher/start-ai" && req.method === "POST") { jsonResponse(res, 200, await startAI()); return true; }
  if (url === "/api/launcher/stop-ai" && req.method === "POST") { jsonResponse(res, 200, await stopAI()); return true; }
  if (url === "/api/launcher/start-stream" && req.method === "POST") { jsonResponse(res, 200, await startStream()); return true; }
  if (url === "/api/launcher/stop-stream" && req.method === "POST") { jsonResponse(res, 200, await stopStream()); return true; }

  jsonResponse(res, 404, { error: "Unknown launcher endpoint" });
  return true;
}

// == Vite plugin ==

export function serverControlPlugin(): Plugin {
  return {
    name: "vite-server-control",
    apply: "serve",

    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          const handled = await handleLauncherRequest(req, res);
          if (!handled) next();
        }
      );

      const cleanup = async () => {
        await Promise.all([
          cleanupProcess(aiProcess, "AI server"),
          cleanupProcess(streamProcess, "Streaming server"),
        ]);
      };

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      process.once("exit", () => {
        if (isAlive(aiProcess)) aiProcess!.kill("SIGKILL");
        if (isAlive(streamProcess)) streamProcess!.kill("SIGKILL");
      });
    },
  };
}
