import "server-only";
import { CavemanApiError, cavemanFetch } from "./caveman";

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export async function load<T>(userId: string, path: string): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await cavemanFetch<T>(userId, path) };
  } catch (error) {
    if (error instanceof CavemanApiError) return { ok: false, status: error.status, message: error.message };
    return { ok: false, status: 500, message: "Unexpected error." };
  }
}
