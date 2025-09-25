"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { RECORDS_ENDPOINT } from "@/lib/config";

type Remark = { text: string; ts: number };
type ReportItem = { name: string; remarks: Remark[]; addedAt?: number };
type ReportEntry = {
  items: ReportItem[];
  sessionId?: string;
  videoSource?: "local" | "drive";
  videoExt?: string;
  driveFileId?: string | null;
  driveWebViewLink?: string | null;
};

function formatMsToTime(ms: number | undefined): string {
  const total = Math.max(0, Math.floor(((ms ?? 0) as number) / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ReportTablePage() {
  const t = useTranslations("reportTable");
  const [records, setRecords] = useState<Record<string, ReportEntry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(RECORDS_ENDPOINT, { cache: "no-store" });
        const data = res.ok ? await res.json() : {};
        if (!alive) return;
        setRecords(data || {});
      } catch (err: unknown) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : t("errorLoading"));
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const handleDelete = async (sessionKey: string) => {
    if (!sessionKey) return;
    const ok = confirm(t("confirmDelete", { name: sessionKey }));
    if (!ok) return;
    setDeleting(sessionKey);
    setError(null);
    try {
      const url = `${RECORDS_ENDPOINT}?id=${encodeURIComponent(sessionKey)}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || `Failed to delete (${res.status})`;
        throw new Error(msg);
      }
      setRecords((prev) => {
        const next = { ...(prev || {}) } as Record<string, ReportEntry>;
        delete next[sessionKey];
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const sessionRows = useMemo(() => {
    return Object.entries(records || {}).map(([key, entry]) => {
      const items = (entry?.items || []).map((it) => ({
        name: it.name || "(unnamed)",
        addedAt: it.addedAt,
        durationSec: it?.remarks?.length ? Math.max(0, Math.floor((it.remarks.at(-1)?.ts || 0) / 1000)) : 0,
        remarks: it.remarks || [],
      }));
      const isDrive = (entry?.videoSource || "local") === "drive";
      const videoPath = !isDrive && entry?.sessionId ? `/videos/${entry.sessionId}.${entry.videoExt || "webm"}` : null;
      const driveLink = isDrive ? (entry?.driveWebViewLink || null) : null;
      return { sessionKey: key, items, videoPath, driveLink };
    });
  }, [records]);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link href="/" className="text-sm text-blue-700 underline">{t("home")}</Link>
      </div>

      <div className="mt-3 text-sm">
        {loading && <span className="text-gray-600">{t("loading")}</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <div className="mt-4 overflow-auto border rounded bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2">{t("thRecordName")}</th>
              <th className="text-left px-3 py-2">{t("thItems")}</th>
              <th className="text-left px-3 py-2">{t("thRemarks")}</th>
              <th className="text-left px-3 py-2">{t("thVideo")}</th>
              <th className="text-left px-3 py-2 w-24">{t("thActions")}</th>
            </tr>
          </thead>
          <tbody>
            {sessionRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={5}>{t("noRecords")}</td>
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
                            <div className="text-xs text-gray-500">{t("added")} {formatMsToTime(it.addedAt)} · {t("duration")} {it.durationSec}s</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">{t("dash")}</span>
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
                              <span className="text-gray-500">{t("dash")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">{t("dash")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.videoPath ? (
                      <Link href={row.videoPath} className="text-blue-700 underline" target="_blank">{t("view")}</Link>
                    ) : row.driveLink ? (
                      <Link href={row.driveLink} className="text-blue-700 underline" target="_blank">{t("openInDrive")}</Link>
                    ) : (
                      <span className="text-gray-500">{t("dash")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-red-700 border border-red-300 hover:bg-red-50 rounded px-3 py-1 text-xs disabled:opacity-50"
                      onClick={() => handleDelete(row.sessionKey)}
                      disabled={deleting === row.sessionKey}
                    >
                      {deleting === row.sessionKey ? t("deleting") : t("delete")}
                    </button>
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


