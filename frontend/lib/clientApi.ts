"use client";

async function handle(res: Response) {
  const json = await res.json().catch(() => ({ error: "Unexpected response." }));
  if (!res.ok || json?.success === false) {
    const e: any = new Error(json.error || "Request failed.");
    e.code = json.code;
    throw e;
  }
  return json;
}

export async function readApi(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params });
  return handle(await fetch(`/gs/data?${qs.toString()}`, { credentials: "same-origin" }));
}

export async function writeApi(payload: Record<string, unknown>) {
  return handle(
    await fetch(`/gs/faculty/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
  );
}

export function friendly(e: any): string {
  if (e?.code === "API_NOT_DEPLOYED")
    return "The attendance database functions aren't deployed yet. Apply the Supabase migration to enable this feature.";
  return e?.message || "Something went wrong.";
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
