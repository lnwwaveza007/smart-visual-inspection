"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Remark = { text: string; ts: number };
type ReportItem = { name: string; remarks: Remark[]; addedAt?: number };
type ReportEntry = { items: ReportItem[]; sessionId?: string; videoExt?: string };

function formatMsToTime(ms: number | undefined): string {
  const total = Math.max(0, Math.floor(((ms ?? 0) as number) / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ReportTablePage() {
  const [records, setRecords] = useState<Record<string, ReportEntry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:4000/records", { cache: "no-store" });
        const data = res.ok ? await res.json() : {};
        if (!alive) return;
        setRecords(data || {});
      } catch (err: unknown) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load records");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const sessionRows = useMemo(() => {
    return Object.entries(records || {}).map(([key, entry]) => {
      const items = (entry?.items || []).map((it) => ({
        name: it.name || "(unnamed)",
        addedAt: it.addedAt,
        durationSec: it?.remarks?.length ? Math.max(0, Math.floor((it.remarks.at(-1)?.ts || 0) / 1000)) : 0,
        remarks: it.remarks || [],
      }));
      const videoPath = entry?.sessionId ? `/videos/${entry.sessionId}.${entry.videoExt || "webm"}` : null;
      return { sessionKey: key, items, videoPath };
    });
  }, [records]);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Video Record Report</h1>
        <Link href="/" className="text-sm text-blue-700 underline">Home</Link>
      </div>

      <div className="mt-3 text-sm">
        {loading && <span className="text-gray-600">Loading…</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <div className="mt-4 overflow-auto border rounded bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2">Record Name</th>
              <th className="text-left px-3 py-2">Items</th>
              <th className="text-left px-3 py-2">Remarks</th>
              <th className="text-left px-3 py-2">Video</th>
            </tr>
          </thead>
          <tbody>
            {sessionRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={4}>No records</td>
              </tr>
            ) : (
              sessionRows.map((row, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{row.sessionKey}</td>
                  <td className="px-3 py-2">
                    {row.items.length ? (
                      <ul className="space-y-2">
                        {row.items.map((it, i) => (
                          <li key={i} className="border rounded p-2">
                            <div className="font-medium">{it.name}</div>
                            <div className="text-xs text-gray-500">Added {formatMsToTime(it.addedAt)} · Duration {it.durationSec}s</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.items.length ? (
                      <ul className="space-y-3">
                        {row.items.map((it, i) => (
                          <li key={i}>
                            {it.remarks.length ? (
                              <ul className="list-disc pl-5">
                                {it.remarks.map((r, ri) => (
                                  <li key={ri}>
                                    <span className="text-xs text-gray-500 mr-2">{formatMsToTime(r.ts)}</span>
                                    {r.text}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.videoPath ? (
                      <Link href={row.videoPath} className="text-blue-700 underline" target="_blank">View</Link>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


