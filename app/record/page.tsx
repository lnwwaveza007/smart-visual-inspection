"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RECORDS_ENDPOINT } from "@/lib/config";
import Modal from "@/app/components/Modal";
// Camera is for preview only; barcode scanned via hardware input

type Remark = {
  text: string;
  ts: number;
};

type ItemRecord = {
  barcode: string;
  name: string;
  remarks: Remark[];
  createdAt: number;
  updatedAt: number;
};

type RecordsIndex = Record<string, ItemRecord>;

const STORAGE_KEY = "svi.itemRecords";

function loadRecords(): RecordsIndex {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecordsIndex;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function saveRecords(records: RecordsIndex) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore quota errors
  }
}

function formatOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function RecordPage() {
  const t = useTranslations("record");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [records, setRecords] = useState<RecordsIndex>({});
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionStartTsRef = useRef<number | null>(null);
  const sessionBarcodesRef = useRef<Set<string>>(new Set());
  const [sessionItemIds, setSessionItemIds] = useState<string[]>([]);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [serverSaving, setServerSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savingToDrive, setSavingToDrive] = useState(false);

  // Storage selection and Google Drive auth state
  const [storageMode, setStorageMode] = useState<"local" | "drive">("local");
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [driveTokenExpiryMs, setDriveTokenExpiryMs] = useState<number>(0);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null);
  // legacy inline select removed in favor of explorer modal
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuthed, setDriveAuthed] = useState(false);
  const [driveAuthChecked, setDriveAuthChecked] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  // Explorer state
  const [explorerPath, setExplorerPath] = useState<Array<{ id: string; name: string }>>([{ id: "", name: "My Drive" }]);
  const [explorerFolders, setExplorerFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);

  const [nameInput, setNameInput] = useState("");
  const [remarkInput, setRemarkInput] = useState("");

  // Camera testing: allow disabling camera completely
  const [cameraDisabled, setCameraDisabled] = useState<boolean>(false);
  const CAMERA_DISABLED_KEY = "svi.cameraDisabled";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAMERA_DISABLED_KEY);
      if (saved === "1") setCameraDisabled(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CAMERA_DISABLED_KEY, cameraDisabled ? "1" : "0");
    } catch {}
  }, [cameraDisabled]);

  // Prevent closing/tab navigation while saving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (savingToDrive || serverSaving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [savingToDrive, serverSaving]);

  // legacy scan state removed; manual item flow in use

  // Derived selected record
  const activeRecord = useMemo(() => (activeBarcode ? records[activeBarcode] : undefined), [records, activeBarcode]);

  // Enumerate available video input devices and keep selection valid
  const queryDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || "Camera" }));
      setCameraDevices(videos);
      const hasSelected = selectedDeviceId ? videos.some((v) => v.deviceId === selectedDeviceId) : false;
      if ((!selectedDeviceId || !hasSelected) && videos.length > 0) {
        setSelectedDeviceId(videos[0].deviceId);
      }
    } catch {
      // ignore
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    // Load saved records on mount
    const loaded = loadRecords();
    setRecords(loaded);
  }, []);

  // Persist selected camera device
  const SELECTED_CAMERA_KEY = "svi.selectedCameraId";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SELECTED_CAMERA_KEY);
      if (saved) setSelectedDeviceId(saved);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      if (selectedDeviceId) localStorage.setItem(SELECTED_CAMERA_KEY, selectedDeviceId);
    } catch {
      // ignore
    }
  }, [selectedDeviceId]);

  // no autofocus needed; no scan input

  // nameInput is used as the "new item name" input for creating items

  // Google Identity Services loader (browser only)
  function getGoogleClientId(): string | null {
    const cid = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string) || "";
    return cid || null;
  }

  async function loadGis(): Promise<void> {
    if (typeof window === "undefined") return;
    if ((window as unknown as { google?: unknown }).google) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google script"));
      document.head.appendChild(script);
    });
  }

  async function ensureDriveToken(interactive: boolean = true): Promise<string | null> {
    try {
      const clientId = getGoogleClientId();
      if (!clientId) {
        setDriveError("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
        return null;
      }
      await loadGis();
      if (driveAccessToken && Date.now() < driveTokenExpiryMs - 10_000) {
        return driveAccessToken;
      }
      type TokenClient = { requestAccessToken: () => void };
      type GoogleOauth2 = { initTokenClient?: (args: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
      }) => TokenClient };
      type GoogleGlobal = { accounts?: { oauth2?: GoogleOauth2 } };
      const googleGlobal = (window as unknown as { google?: GoogleGlobal }).google;
      const oauth2 = googleGlobal?.accounts?.oauth2;
      if (!oauth2?.initTokenClient) {
        setDriveError("Google auth unavailable");
        return null;
      }
      const scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      ].join(" ");
      const token: { value: string | null } = { value: null };
      await new Promise<void>((resolve) => {
        const init = oauth2.initTokenClient;
        if (!init) {
          setDriveError("Google auth unavailable");
          resolve();
          return;
        }
        const client = init({
          client_id: clientId,
          scope: scopes,
          prompt: interactive ? "consent" : "",
          callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
            if (resp?.error) {
              setDriveError(resp.error);
              token.value = null;
            } else {
              const expiresInSec = Math.max(1, Number(resp?.expires_in || 0));
              setDriveAccessToken(resp.access_token || null);
              setDriveTokenExpiryMs(Date.now() + expiresInSec * 1000);
              setDriveError(null);
              token.value = resp.access_token || null;
              // Persist token to httpOnly cookie for server-side Drive streaming
              try {
                const t = resp.access_token || "";
                if (t) {
                  void fetch("/api/drive/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken: t, expiresInSec }),
                  }).then(() => setDriveAuthed(true));
                }
              } catch {}
            }
            resolve();
          },
        });
        client.requestAccessToken();
      });
      return token.value;
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : "Drive auth failed");
      return null;
    }
  }

  // Check cookie-based auth so we can hide sign-in button if already logged in
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/drive/status", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const ok = Boolean(json?.authed);
        setDriveAuthed(ok);
        setDriveAuthChecked(true);
      } catch {
        if (!alive) return;
        setDriveAuthed(false);
        setDriveAuthChecked(true);
      }
    };
    check();
    return () => { alive = false; };
  }, []);

  async function listDriveFolders(parentId: string | null): Promise<Array<{ id: string; name: string }>> {
    try {
      const url = `/api/drive/list${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Drive list failed ${res.status}`);
      const data = (await res.json()) as { folders?: Array<{ id: string; name: string }>} ;
      return data.folders || [];
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : "Failed to list folders");
      return [];
    }
  }

  function openFolderModal() {
    setFolderModalOpen(true);
    setDriveError(null);
    // Start at root for simplicity
    const initialPath = [{ id: "", name: "My Drive" }];
    setExplorerPath(initialPath);
    setExplorerLoading(true);
    listDriveFolders(null)
      .then((items) => setExplorerFolders(items))
      .finally(() => setExplorerLoading(false));
  }

  async function uploadVideoToDrive(blob: Blob, filename: string, mimeType: string, folderId?: string | null): Promise<{ id: string; webViewLink?: string; webContentLink?: string } | null> {
    try {
      // Try server-side upload using cookie token (no re-login prompt)
      const params = new URLSearchParams({ name: filename });
      if (folderId) params.set("parentId", folderId);
      const res = await fetch(`/api/drive/upload?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
      if (res.status === 401) {
        // No cookie token; request interactive login once then retry
        const token = await ensureDriveToken(true);
        if (!token) return null;
        const retry = await fetch(`/api/drive/upload?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: blob,
        });
        if (!retry.ok) throw new Error(`Drive upload failed ${retry.status}`);
        const json = await retry.json();
        return json as { id: string; webViewLink?: string; webContentLink?: string };
      }
      if (!res.ok) throw new Error(`Drive upload failed ${res.status}`);
      const json = await res.json();
      return json as { id: string; webViewLink?: string; webContentLink?: string };
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : "Drive upload failed");
      return null;
    }
  }

  useEffect(() => {
    // Start or restart camera preview using the selected device (no barcode decoding)
    let unmounted = false;
    const videoEl = videoRef.current;
    let assignedStream: MediaStream | null = null;


    const start = async () => {
      try {
        if (cameraDisabled) {
          // Ensure any existing stream is stopped
          const existing = streamRef.current;
          if (existing) {
            existing.getTracks().forEach((t) => t.stop());
          }
          streamRef.current = null;
          setCameraActive(false);
          if (videoEl) {
            (videoEl as unknown as { srcObject: MediaStream | null }).srcObject = null;
          }
          setCameraError(null);
          return;
        }
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: "environment" },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (unmounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoEl) {
          (videoEl as unknown as { srcObject: MediaStream | null }).srcObject = stream as MediaStream;
          await videoEl.play();
          assignedStream = stream;
        }
        streamRef.current = stream;
        setCameraActive(true);
        setCameraError(null);
        // After permission granted, labels become available
        queryDevices();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Camera error";
        setCameraError(message);
        setCameraActive(false);
        // Fallback: if selected device failed, clear selection to retry with default
        if (selectedDeviceId) {
          setSelectedDeviceId(null);
        }
      }
    };

    start();

    return () => {
      unmounted = true;
      if (assignedStream) assignedStream.getTracks().forEach((t) => t.stop());
      if (videoEl) {
        (videoEl as unknown as { srcObject: MediaStream | null }).srcObject = null;
      }
    };
  }, [selectedDeviceId, cameraDisabled, queryDevices]);

  // Auto-refresh the device list when cameras are plugged/unplugged
  useEffect(() => {
    const handler = () => {
      queryDevices();
    };
    try {
      navigator.mediaDevices.addEventListener("devicechange", handler);
    } catch {}
    return () => {
      try {
        navigator.mediaDevices.removeEventListener("devicechange", handler);
      } catch {}
    };
  }, [queryDevices]);

  function ensureRecord(barcode: string): ItemRecord {
    const existing = records[barcode];
    if (existing) return existing;
    const now = Date.now();
    const created: ItemRecord = {
      barcode,
      name: "",
      remarks: [],
      createdAt: now,
      updatedAt: now,
    };
    const next = { ...records, [barcode]: created };
    setRecords(next);
    saveRecords(next);
    return created;
  }

  // scan-based flow removed

  // no per-item name editing; items are named when added

  function handleAddRemark() {
    const text = remarkInput.trim();
    if (!isRecording || !text || !activeBarcode) return;
    const rec = ensureRecord(activeBarcode);
    if (!rec.name || rec.name.trim().length === 0) return;
    const now = Date.now();
    const start = sessionStartTsRef.current ?? now;
    const offsetMs = Math.max(0, now - start);
    const updated: ItemRecord = {
      ...rec,
      remarks: [
        ...rec.remarks,
        { text, ts: offsetMs },
      ],
      updatedAt: offsetMs,
    };
    const next = { ...records, [activeBarcode]: updated };
    setRecords(next);
    saveRecords(next);
    setRemarkInput("");
  }

  async function stopSession() {
    if (!isRecording) return;
    setIsRecording(false);
    const id = sessionId;
    const items = sessionItemIds.map((bc) => {
      const rec = records[bc];
      return {
        name: rec?.name || "",
        addedAt: rec?.createdAt ?? 0,
        remarks: (rec?.remarks ?? []).map((r) => ({ text: r.text, ts: r.ts })),
      };
    }).filter((it) => (it.name && it.name.trim().length > 0) || (it.remarks && it.remarks.length > 0));

    if (!id) {
      // Reset session state
      setActiveBarcode(null);
      setNameInput("");
      setRemarkInput("");
      sessionStartTsRef.current = null;
      sessionBarcodesRef.current = new Set();
      return;
    }

    // Stop recorder and upload video named by session id
    let persistedVideoExt: string = "webm";
    let driveFile: { id: string; webViewLink?: string; webContentLink?: string } | null = null;
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        const stopped = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
        });
        const mimeType = recorder.mimeType || "video/webm";
        recorder.stop();
        await stopped;
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "webm";
        persistedVideoExt = ext;
        if (storageMode === "drive") {
          setSavingToDrive(true);
          const filename = `${id}.${ext}`;
          driveFile = await uploadVideoToDrive(blob, filename, mimeType, driveFolderId);
        } else {
          await fetch(`/api/upload?name=${encodeURIComponent(id)}&ext=${encodeURIComponent(ext)}`, {
            method: "POST",
            headers: { "Content-Type": mimeType },
            body: blob,
          });
        }
      }
    } catch {
      // ignore upload errors
    } finally {
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
      setSavingToDrive(false);
    }

    setServerSaving(true);
    setServerError(null);
    try {
      const res = await fetch(RECORDS_ENDPOINT);
      const existing = res.ok ? await res.json() : {};
      const key = (sessionNameInput.trim() || id);
      const entryBase: Record<string, unknown> = { items, sessionId: id };
      const entry = storageMode === "drive"
        ? { ...entryBase, videoSource: "drive", driveFileId: driveFile?.id || null, driveWebViewLink: driveFile?.webViewLink || null }
        : { ...entryBase, videoSource: "local", videoExt: persistedVideoExt };
      const merged = { ...(existing || {}), [key]: entry } as Record<string, unknown>;
      const putRes = await fetch(RECORDS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!putRes.ok) throw new Error(`HTTP ${putRes.status}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setServerSaving(false);
      // Reset session state
      setActiveBarcode(null);
      setNameInput("");
      setRemarkInput("");
      setSessionId(null);
      setSessionNameInput("");
      sessionStartTsRef.current = null;
      sessionBarcodesRef.current = new Set();
      setSessionItemIds([]);
    }
  }

  function startSession() {
    if (isRecording) return;
    setServerError(null);
    const ts = Date.now();
    sessionStartTsRef.current = ts;
    setSessionId(`session-${ts}`);
    sessionBarcodesRef.current = new Set();
    setSessionItemIds([]);
    setSessionNameInput("");
    setIsRecording(true);
    setActiveBarcode(null);
    setNameInput("");
    setRemarkInput("");
    try {
      const stream = streamRef.current;
      if (stream) {
        recordedChunksRef.current = [];
        const preferredTypes = [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
        ];
        const supportsType = (type: string): boolean => {
          try {
            return typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type);
          } catch {
            return false;
          }
        };
        const chosen = preferredTypes.find((t) => supportsType(t));
        const recorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : undefined);
        recorder.ondataavailable = (ev: BlobEvent) => {
          if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      }
    } catch {}
  }

  function handleAddItem() {
    const itemName = nameInput.trim();
    if (!isRecording || !itemName || !sessionNameInput.trim()) return;
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionBarcodesRef.current.add(id);
    setSessionItemIds((prev) => [...prev, id]);
    const now = Date.now();
    const start = sessionStartTsRef.current ?? now;
    const offsetMs = Math.max(0, now - start);
    const created: ItemRecord = {
      barcode: id,
      name: itemName,
      remarks: [],
      createdAt: offsetMs,
      updatedAt: offsetMs,
    };
    const next = { ...records, [id]: created };
    setRecords(next);
    saveRecords(next);
    setActiveBarcode(id);
    setNameInput("");
    setRemarkInput("");
  }

  const rightPanelContent = (() => {
    if (!isRecording) {
      return (
        <div className="text-sm text-gray-500">{t("startSessionToAdd")}</div>
      );
    }
    if (sessionItemIds.length === 0) {
      return (
        <div className="text-sm text-gray-500">{t("noItemsYet")}</div>
      );
    }
    return (
      <div className="space-y-4 max-h-[70vh] overflow-auto pr-2">
        {sessionItemIds.map((id) => {
          const rec = records[id];
          if (!rec) return null;
          return (
            <div key={id} className={`border rounded p-3 ${activeBarcode === id ? "border-gray-800" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{rec.name || t("unnamed")}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border"
                    onClick={() => setActiveBarcode(id)}
                  >
                    Select
                  </button>
                  <div className="text-xs text-gray-500">{rec.remarks.length} {t("remarksCount")}</div>
                </div>
              </div>
              {rec.remarks.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {rec.remarks.map((r, idx) => (
                    <li key={idx} className="border border-gray-200 rounded p-2">
                      <div className="text-xs text-gray-500">{formatOffset(r.ts)}</div>
                      <div className="whitespace-pre-wrap">{r.text}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  })();

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <button
            type="button"
            onClick={startSession}
            className="px-4 py-2 rounded bg-green-600 text-white disabled:bg-gray-300"
            disabled={serverSaving || savingToDrive}
          >
            {t("start")}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopSession}
            className="px-4 py-2 rounded bg-red-600 text-white disabled:bg-gray-300"
            disabled={serverSaving || savingToDrive}
          >
            {t("stopSave")}
          </button>
        )}
        {isRecording && (
          <span className="text-sm text-red-600">{t("recording")} {sessionId}</span>
        )}
        {savingToDrive && storageMode === "drive" && (
          <span className="text-sm text-blue-700">{t("savingServer")}</span>
        )}
        {serverSaving && <span className="text-sm text-gray-600">{t("savingServer")}</span>}
        {serverError && <span className="text-sm text-red-600">{serverError}</span>}
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Camera preview + Inputs */}
        <div>
          {/* Storage selection */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="text-sm">{t("storage")}</label>
            <label className="text-sm flex items-center gap-1">
              <input
                type="radio"
                name="storage"
                value="local"
                checked={storageMode === "local"}
                onChange={() => setStorageMode("local")}
              />
              {t("local")}
            </label>
            <label className="text-sm flex items-center gap-1">
              <input
                type="radio"
                name="storage"
                value="drive"
                checked={storageMode === "drive"}
                onChange={() => setStorageMode("drive")}
              />
              {t("googleDrive")}
            </label>
            {storageMode === "drive" && (
              <>
                {(() => {
                  const isReady = Boolean(driveAuthed || driveAccessToken);
                  if (!driveAuthChecked) return null;
                  return !isReady ? (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded border"
                      onClick={() => ensureDriveToken(true)}
                      disabled={serverSaving || savingToDrive}
                    >
                      {t("signIn")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded border"
                      onClick={openFolderModal}
                      disabled={serverSaving || savingToDrive}
                    >
                      {t("browseFolders")}
                    </button>
                  );
                })()}
                <span className="text-xs text-gray-600">
                  {t("folder")} {driveFolderName ? driveFolderName : t("rootLabel")}
                </span>
                {driveError && (
                  <span className="text-xs text-red-600">{driveError}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">{t("cameraDevice")}</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white disabled:bg-gray-100"
                value={selectedDeviceId ?? ""}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                disabled={cameraDisabled}
              >
                {cameraDevices.length === 0 ? (
                  <option value="">{t("defaultCamera")}</option>
                ) : (
                  cameraDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || t("camera")}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              onClick={() => queryDevices()}
              className="px-3 py-2 rounded border"
              disabled={cameraDisabled}
            >
              {t("refresh")}
            </button>
            <label className="text-sm flex items-center gap-2 border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={cameraDisabled}
                onChange={(e) => setCameraDisabled(e.target.checked)}
              />
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-camera-video-off" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M10.961 12.365a2 2 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272l.714 1H9.5a1 1 0 0 1 1 1v6a1 1 0 0 1-.144.518zM1.428 4.18A1 1 0 0 0 1 5v6a1 1 0 0 0 1 1h5.014l.714 1H2a2 2 0 0 1-2-2V5c0-.675.334-1.272.847-1.634zM15 11.73l-3.5-1.555v-4.35L15 4.269zm-4.407 3.56-10-14 .814-.58 10 14z"/>
              </svg>
            </label>
          </div>
          <div className="aspect-video w-full bg-black/80 rounded overflow-hidden flex items-center justify-center mt-4">
            <video
              ref={videoRef}
              id="record-video"
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 min-h-5">
            {cameraError ? (
              <span className="text-red-600">{cameraError}</span>
            ) : cameraActive ? (
              <span>{t("cameraActive")}</span>
            ) : (
              <span>{cameraDisabled ? t("cameraDisabledTesting") : t("startingCamera")}</span>
            )}
          </div>

          {/* Session name and add item flow */}
          {isRecording && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">{t("sessionName")}</label>
                <input
                  type="text"
                  value={sessionNameInput}
                  onChange={(e) => setSessionNameInput(e.target.value)}
                  placeholder={t("sessionNamePlaceholder")}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">{t("newItemName")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={sessionNameInput.trim() ? t("itemNamePlaceholder") : t("enterSessionFirst")}
                    disabled={!sessionNameInput.trim()}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddItem();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!sessionNameInput.trim() || !nameInput.trim()}
                    className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-300"
                  >
                    {t("addItem")}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm mb-1">{t("addRemark")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  placeholder={activeBarcode ? t("remarkPlaceholder") : t("addAnItemFirst")}
                  disabled={!isRecording || !activeBarcode}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                  onFocus={(e) => {
                    if (!activeRecord?.name?.trim()) {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddRemark();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddRemark}
                  disabled={!isRecording || !activeBarcode || !(activeRecord?.name?.trim()) || !remarkInput.trim()}
                  className="px-4 py-2 rounded bg-gray-900 text-white disabled:bg-gray-300"
                >
                  {t("add")}
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {activeBarcode ? (
                <span>
                  {t("activeItem")} <span className="font-mono">{activeBarcode}</span>. Use Start/Stop to control the session.
                </span>
              ) : (
                <span>{t("noActiveItem")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: History */}
        <div className="border border-gray-200 rounded p-4 bg-white/50">
          <h2 className="text-lg font-medium">{t("itemHistory")}</h2>
          <div className="mt-3">{rightPanelContent}</div>
        </div>
      </div>
      {(savingToDrive || (serverSaving && storageMode === "drive")) && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded shadow p-6 max-w-sm text-center">
            <div className="text-base font-medium mb-1">{t("pleaseWait")}</div>
            <div className="text-sm text-gray-700">{savingToDrive ? t("savingToDrive") : t("finalizing")}</div>
          </div>
        </div>
      )}
      {/* Drive folder picker modal */}
      <DriveFolderModal
        open={folderModalOpen}
        path={explorerPath}
        items={explorerFolders}
        loading={explorerLoading}
        onRefresh={() => {
          const current = explorerPath.at(-1);
          setExplorerLoading(true);
          listDriveFolders(current && current.id ? current.id : null)
            .then((items) => setExplorerFolders(items))
            .finally(() => setExplorerLoading(false));
        }}
        onNav={(folder) => {
          const nextPath = [...explorerPath, { id: folder.id, name: folder.name }];
          setExplorerPath(nextPath);
          setExplorerLoading(true);
          listDriveFolders(folder.id)
            .then((items) => setExplorerFolders(items))
            .finally(() => setExplorerLoading(false));
        }}
        onUpTo={(idx) => {
          const nextPath = explorerPath.slice(0, idx + 1);
          setExplorerPath(nextPath);
          const current = nextPath.at(-1);
          setExplorerLoading(true);
          listDriveFolders(current && current.id ? current.id : null)
            .then((items) => setExplorerFolders(items))
            .finally(() => setExplorerLoading(false));
        }}
        onCancel={() => setFolderModalOpen(false)}
        onSelectHere={() => {
          const current = explorerPath.at(-1);
          const id = current && current.id ? current.id : null;
          setDriveFolderId(id);
          setDriveFolderName(current ? current.name : null);
          setFolderModalOpen(false);
        }}
      />
    </div>
  );
}

// Modal to pick Google Drive folder
function DriveFolderModal({
  open,
  path,
  items,
  loading,
  onNav,
  onUpTo,
  onRefresh,
  onCancel,
  onSelectHere,
}: {
  open: boolean;
  path: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string }>;
  loading: boolean;
  onNav: (folder: { id: string; name: string }) => void;
  onUpTo: (index: number) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onSelectHere: () => void;
}) {
  return (
    <Modal
      open={open}
      title={useTranslations("drive")("selectFolderTitle")}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="px-3 py-1.5 rounded border" onClick={onCancel}>{useTranslations("drive")("cancel")}</button>
          <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white" onClick={onSelectHere}>{useTranslations("drive")("selectThisFolder")}</button>
        </>
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-500">{useTranslations("drive")("location")}</span>
          <nav className="flex items-center gap-1 flex-wrap">
            {path.map((p, idx) => (
              <span key={p.id + idx} className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-blue-700 hover:underline"
                  onClick={() => onUpTo(idx)}
                >
                  {p.name}
                </button>
                {idx < path.length - 1 && <span className="text-gray-400">/</span>}
              </span>
            ))}
          </nav>
        </div>
        <button type="button" className="px-2 py-1 text-sm rounded border" onClick={onRefresh} disabled={loading}>
          {loading ? useTranslations("drive")("loading") : useTranslations("drive")("refresh")}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {loading ? (
          <div className="text-sm text-gray-500">{useTranslations("drive")("loading")}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-500">{useTranslations("drive")("noFolders")}</div>
        ) : (
          items.map((f) => (
            <button
              key={f.id}
              type="button"
              className="flex items-center gap-2 p-3 border rounded hover:bg-gray-50 text-left"
              onClick={() => onNav(f)}
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100">📁</span>
              <span className="truncate">{f.name}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}


