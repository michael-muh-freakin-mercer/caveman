"use client";

import { useEffect, useState } from "react";
import { Cavman, type Mood } from "./cavman";

/** Fired by prompt boxes on every keystroke, so Cavman can look up when you type. */
export const TYPING_EVENT = "cavman:typing";

export function announceTyping() {
  window.dispatchEvent(new Event(TYPING_EVENT));
}

const LISTEN_MS = 1800;

/** Cavman at rest: he blinks now and then, and looks up while someone types in a prompt. */
export function LiveCavman({ className, title }: { className?: string; title?: string }) {
  const [mood, setMood] = useState<Mood>("idle");

  useEffect(() => {
    let lastTyped = 0;
    let blinkEnd: ReturnType<typeof setTimeout> | undefined;
    let listenEnd: ReturnType<typeof setTimeout> | undefined;
    const onTyping = () => {
      lastTyped = Date.now();
      setMood("listen");
      clearTimeout(listenEnd);
      listenEnd = setTimeout(() => setMood("idle"), LISTEN_MS);
    };
    window.addEventListener(TYPING_EVENT, onTyping);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const blinker = reduced
      ? undefined
      : setInterval(() => {
          if (Date.now() - lastTyped < LISTEN_MS) return;
          setMood("blink");
          blinkEnd = setTimeout(() => setMood((m) => (m === "blink" ? "idle" : m)), 160);
        }, 3200);
    return () => {
      window.removeEventListener(TYPING_EVENT, onTyping);
      clearInterval(blinker);
      clearTimeout(blinkEnd);
      clearTimeout(listenEnd);
    };
  }, []);

  return <Cavman mood={mood} className={className} title={title} />;
}
