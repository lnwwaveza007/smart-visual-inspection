"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RECORDS_ENDPOINT } from "@/lib/config";

type Remark = { text: string; ts: number };
type ReportItem = { name: string; remarks: Remark[]; addedAt?: number };
type ReportEntry = {
  items: ReportItem[];
  sessionId?: string;
  // Local storage
  videoSource?: "local" | "drive";
  videoExt?: string;
  // Google Drive
  driveFileId?: string | null;
  driveWebViewLink?: string | null;
};

function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ReportPage() {
  const t = useTranslations("report");
  const [records, setRecords] = useState<Record<string, ReportEntry>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
        const firstKey = Object.keys(data || {})[0] || null;
        setSelectedKey(firstKey);
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

  const selected = selectedKey ? records[selectedKey] : undefined;
  const { videoSrc } = useMemo(() => {
    if (!selected?.sessionId) return { videoSrc: null as string | null, driveLink: null as string | null };
    if ((selected.videoSource || "local") === "drive") {
      const fileId = selected.driveFileId || null;
      const src = fileId ? `/api/drive/stream?fileId=${encodeURIComponent(fileId)}` : null;
      return { videoSrc: src } as { videoSrc: string | null };
    }
    const ext = selected.videoExt || "webm";
    return { videoSrc: `/videos/${selected.sessionId}.${ext}` } as { videoSrc: string | null };
  }, [selected]);

  const seekTo = (ms: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, (ms || 0) / 1000);
    el.play().catch(() => {});
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="mt-3 flex items-center gap-3">
        <select
          className="border border-gray-300 rounded px-3 py-2 bg-white"
          value={selectedKey ?? ""}
          onChange={(e) => setSelectedKey(e.target.value || null)}
        >
          {Object.keys(records).length === 0 ? (
            <option value="">{t("noSessions")}</option>
          ) : (
            Object.keys(records).map((key) => (
              <option key={key} value={key}>{key}</option>
            ))
          )}
        </select>
        {loading && <span className="text-sm text-gray-600">{t("loading")}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="aspect-video w-full bg-black/80 rounded overflow-hidden flex items-center justify-center">
            {videoSrc ? (
              <video ref={videoRef} src={videoSrc} controls className="w-full h-full object-contain" />
            ) : (
              <div className="text-sm text-gray-400">{t("noVideo")}</div>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {selected?.sessionId ? (
              <span>{t("session")} <span className="font-mono">{selected.sessionId}</span></span>
            ) : (
              <span>{t("selectASession")}</span>
            )}
          </div>
        </div>

        <div className="border border-gray-200 rounded p-4 bg-white/50">
          <h2 className="text-lg font-medium">{t("remarkHistory")}</h2>
          {!selected ? (
            <div className="mt-3 text-sm text-gray-500">{t("noSessionSelected")}</div>
          ) : selected.items?.length ? (
            <div className="mt-3 space-y-4 max-h-[70vh] overflow-auto pr-2">
              {selected.items.map((it, idx) => (
                <div key={idx} className="border rounded p-3">
                  <div className="font-medium flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-0.5 rounded border"
                      onClick={() => seekTo(it.addedAt || 0)}
                    >
                      {formatOffset(it.addedAt || 0)}
                    </button>
                    <span>{it.name || "(unnamed)"}</span>
                  </div>
                  {it.remarks?.length ? (
                    <ul className="mt-2 space-y-2">
                      {it.remarks.map((r, ridx) => (
                        <li key={ridx} className="border border-gray-200 rounded p-2">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              className="text-xs px-2 py-0.5 rounded border"
                              onClick={() => seekTo(r.ts)}
                            >
                              {formatOffset(r.ts)}
                            </button>
                            <div className="text-xs text-gray-500">{r.text}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">{t("noRemarks")}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-500">{t("noItems")}</div>
          )}
        </div>
      </div>
    </div>
  );
}


