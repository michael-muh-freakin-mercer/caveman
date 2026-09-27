"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunDetail, TimelineEvent } from "./types";

export type Connection = "connecting" | "live" | "reconnecting" | "closed";

export function mergeTimeline(current: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  const bySequence = new Map(current.map((event) => [event.sequence, event]));
  for (const event of incoming) bySequence.set(event.sequence, event);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/** Whether the live stream can stop: the run is terminal and nothing more will change. */
export function streamFinished(run: RunDetail): boolean {
  if (run.status === "abandoned") return true;
  return run.status === "completed" && run.delivery !== null;
}

export async function fetchRun(runId: string): Promise<RunDetail> {
  const response = await fetch(`/api/caveman/runs/${runId}`, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status})`);
  }
  return response.json();
}

/**
 * Observe a run: server-sent events for timeline and state changes, with the
 * authoritative detail re-read from the API whenever state changes. The
 * browser only observes; execution never depends on this connection.
 */
export function useRun(initial: RunDetail) {
  const [run, setRun] = useState<RunDetail>(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRun(initial.id);
      setRun((previous) => ({ ...next, timeline: mergeTimeline(previous.timeline, next.timeline) }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refresh the run.");
    }
  }, [initial.id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 250);
  }, [refresh]);

  const finished = streamFinished(run);

  useEffect(() => {
    if (finished) return;
    // Resumes from the server-rendered cursor; EventSource sends Last-Event-ID on reconnect.
    const source = new EventSource(`/api/caveman/runs/${initial.id}/stream?after=${initial.event_cursor}`);
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    source.addEventListener("timeline", (message) => {
      const event = JSON.parse((message as MessageEvent).data) as TimelineEvent;
      setRun((previous) => ({ ...previous, timeline: mergeTimeline(previous.timeline, [event]) }));
      setConnection("live");
    });
    source.addEventListener("state", () => {
      setConnection("live");
      scheduleRefresh();
    });
    return () => source.close();
  }, [initial.id, initial.event_cursor, finished, scheduleRefresh]);

  // A permanently closed stream (e.g. the proxy restarted) falls back to polling.
  useEffect(() => {
    if (connection !== "closed" || finished) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [connection, finished, refresh]);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  return { run, setRun, connection: finished ? ("closed" as const) : connection, error, refresh };
}

export async function postJson<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`/api/caveman/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Request failed (${response.status})`);
  return data as T;
}
