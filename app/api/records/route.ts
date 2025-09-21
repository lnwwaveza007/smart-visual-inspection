import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, UPSTREAM_RECORDS_ENDPOINT } from "@/lib/config";

// Normalize upstream payloads (object map or array) to an object keyed by id
function normalizeToMap(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    const array = input as Array<Record<string, unknown>>;
    return Object.fromEntries(
      array.map((r) => [String((r as { id: string }).id), { ...r, id: undefined }])
    );
  }
  return (input as Record<string, unknown>) || {};
}

export async function GET() {
  try {
    const res = await fetch(UPSTREAM_RECORDS_ENDPOINT, { cache: "no-store" });
    const raw = res.ok ? await res.json() : {};
    return NextResponse.json(normalizeToMap(raw));
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Try a direct PUT first (custom backend path)
    const direct = await fetch(UPSTREAM_RECORDS_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (direct.ok) {
      const raw = await direct.json().catch(() => ({}));
      return NextResponse.json(normalizeToMap(raw));
    }

    // Fallback for json-server: upsert each record by id
    if (direct.status === 404 || direct.status === 405) {
      const entries = Object.entries((body as Record<string, Record<string, unknown>>) || {});
      for (const [id, value] of entries) {
        const itemUrl = `${API_BASE_URL}/records/${encodeURIComponent(id)}`;
        const getRes = await fetch(itemUrl, { cache: "no-store" });
        if (getRes.ok) {
          await fetch(itemUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...value }),
          });
        } else {
          await fetch(`${API_BASE_URL}/records`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...value }),
          });
        }
      }

      // Return latest state
      const finalRes = await fetch(UPSTREAM_RECORDS_ENDPOINT, { cache: "no-store" });
      const raw = finalRes.ok ? await finalRes.json() : {};
      return NextResponse.json(normalizeToMap(raw));
    }

    return NextResponse.json({ error: `Upstream error ${direct.status}` }, { status: direct.status });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}


