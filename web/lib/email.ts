import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Transactional email. Resend when RESEND_API_KEY is set; otherwise, outside
 * production, messages go to a local JSONL outbox (and the server log) so
 * development and end-to-end tests can follow links. In production without a
 * provider, sending fails loudly instead of pretending the email went out.
 */
export type Email = { to: string; subject: string; text: string; html: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || process.env.NODE_ENV !== "production" || process.env.CAVEMAN_E2E === "1";
}

export async function sendEmail(message: Email): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Caveman <no-reply@caveman.local>", ...message }),
    });
    if (!response.ok) throw new Error(`Email provider refused the message (${response.status})`);
    return;
  }
  if (!emailConfigured()) throw new Error("No email provider is configured (set RESEND_API_KEY).");
  const outbox = process.env.CAVEMAN_DEV_OUTBOX ?? ".local/outbox.jsonl";
  await mkdir(dirname(outbox), { recursive: true });
  await appendFile(outbox, JSON.stringify({ ...message, sent_at: new Date().toISOString() }) + "\n");
  console.info(`[caveman] email to ${message.to}: ${message.subject}`);
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function linkEmail(to: string, subject: string, intro: string, action: string, url: string): Email {
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${url}\n\nIf you did not ask for this, ignore this email.`,
    html: `<p>${escape(intro)}</p><p><a href="${escape(url)}">${escape(action)}</a></p><p>If you did not ask for this, ignore this email.</p>`,
  };
}
