/**
 * useServerLauncher.ts
 *
 * React hook that communicates with the Vite dev-server launcher plugin
 * (/api/launcher/*) to start, stop, and monitor the AI server and MediaMTX
 * streaming server.
 *
 * Falls back gracefully when the launcher API is not available (e.g. in
 * production / built app) — all statuses become "unavailable".
 */

import { useState, useEffect, useCallback, useRef } from "react";

export type ServerRunState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "unavailable";

export interface ServerInfo {
  status: ServerRunState;
  pid: number | null;
  uptime: number | null; // seconds
}

export interface LauncherStatus {
  aiServer: ServerInfo;
  streaming: ServerInfo;
}

const UNAVAILABLE: LauncherStatus = {
  aiServer:  { status: "unavailable", pid: null, uptime: null },
  streaming: { status: "unavailable", pid: null, uptime: null },
};

const BASE = "/api/launcher";

async function apiFetch(path: string, method: "GET" | "POST" = "GET") {
  const res = await fetch(`${BASE}${path}`, { method });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useServerLauncher(pollIntervalMs = 5000) {
  const [status, setStatus]   = useState<LauncherStatus>(UNAVAILABLE);
  const [available, setAvailable] = useState<boolean | null>(null); // null = not yet checked
  const [aiLoading, setAiLoading]         = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [lastMessage, setLastMessage]     = useState<string>("");

  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/status");
      if (!mountedRef.current) return;
      setAvailable(true);
      setStatus({
        aiServer: {
          status: data.aiServer.status as ServerRunState,
          pid:    data.aiServer.pid,
          uptime: data.aiServer.uptime,
        },
        streaming: {
          status: data.streaming.status as ServerRunState,
          pid:    data.streaming.pid,
          uptime: data.streaming.uptime,
        },
      });
    } catch {
      if (!mountedRef.current) return;
      setAvailable(false);
      setStatus(UNAVAILABLE);
    }
  }, []);

  // Poll every `pollIntervalMs`
  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    const id = setInterval(fetchStatus, pollIntervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchStatus, pollIntervalMs]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const startAI = useCallback(async () => {
    setAiLoading(true);
    setStatus((s) => ({ ...s, aiServer: { ...s.aiServer, status: "starting" } }));
    try {
      const res = await apiFetch("/start-ai", "POST");
      setLastMessage(res.message ?? "");
    } catch (e: any) {
      setLastMessage(`Failed to start AI server: ${e.message}`);
    } finally {
      // Give it a moment then refresh
      setTimeout(fetchStatus, 1500);
      setAiLoading(false);
    }
  }, [fetchStatus]);

  const stopAI = useCallback(async () => {
    setAiLoading(true);
    setStatus((s) => ({ ...s, aiServer: { ...s.aiServer, status: "stopping" } }));
    try {
      const res = await apiFetch("/stop-ai", "POST");
      setLastMessage(res.message ?? "");
    } catch (e: any) {
      setLastMessage(`Failed to stop AI server: ${e.message}`);
    } finally {
      setTimeout(fetchStatus, 1500);
      setAiLoading(false);
    }
  }, [fetchStatus]);

  const startStream = useCallback(async () => {
    setStreamLoading(true);
    setStatus((s) => ({ ...s, streaming: { ...s.streaming, status: "starting" } }));
    try {
      const res = await apiFetch("/start-stream", "POST");
      setLastMessage(res.message ?? "");
    } catch (e: any) {
      setLastMessage(`Failed to start streaming server: ${e.message}`);
    } finally {
      setTimeout(fetchStatus, 1500);
      setStreamLoading(false);
    }
  }, [fetchStatus]);

  const stopStream = useCallback(async () => {
    setStreamLoading(true);
    setStatus((s) => ({ ...s, streaming: { ...s.streaming, status: "stopping" } }));
    try {
      const res = await apiFetch("/stop-stream", "POST");
      setLastMessage(res.message ?? "");
    } catch (e: any) {
      setLastMessage(`Failed to stop streaming server: ${e.message}`);
    } finally {
      setTimeout(fetchStatus, 1500);
      setStreamLoading(false);
    }
  }, [fetchStatus]);

  return {
    status,
    available,
    aiLoading,
    streamLoading,
    lastMessage,
    startAI,
    stopAI,
    startStream,
    stopStream,
    refresh: fetchStatus,
  };
}

// ── Utility: human-readable uptime ───────────────────────────────────────────

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
