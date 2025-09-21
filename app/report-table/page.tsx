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

  const flatRows = useMemo(() => {
    const entries: Array<{
      sessionKey: string;
      recordBy: string;
      itemName: string;
      addedAt?: number;
      durationSec: number;
      remarkTexts: string[];
      sessionId?: string;
      videoExt?: string;
    }> = [];
    const keys = Object.keys(records || {});
    keys.forEach((key) => {
      const entry = records[key];
      const items = entry?.items || [];
      items.forEach((it) => {
        entries.push({
          sessionKey: key,
          recordBy: "-",
          itemName: it.name || "(unnamed)",
          addedAt: it.addedAt,
          durationSec: it?.remarks?.length ? Math.max(0, Math.floor((it.remarks.at(-1)?.ts || 0) / 1000)) : 0,
          remarkTexts: (it.remarks || []).map((r) => r.text),
          sessionId: entry.sessionId,
          videoExt: entry.videoExt,
        });
      });
    });
    return entries;
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
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Added</th>
              <th className="text-left px-3 py-2">Duration (s)</th>
              <th className="text-left px-3 py-2">Remarks</th>
              <th className="text-left px-3 py-2">Video</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={6}>No records</td>
              </tr>
            ) : (
              flatRows.map((row, idx) => {
                const videoPath = row.sessionId ? `/videos/${row.sessionId}.${row.videoExt || "webm"}` : null;
                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{row.sessionKey}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.itemName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatMsToTime(row.addedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.durationSec}</td>
                    <td className="px-3 py-2">
                      {row.remarkTexts.length ? (
                        <ul className="list-disc pl-5">
                          {row.remarkTexts.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {videoPath ? (
                        <Link href={videoPath} className="text-blue-700 underline" target="_blank">View</Link>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


