"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RECORDS_ENDPOINT } from "@/lib/config";
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

  const [nameInput, setNameInput] = useState("");
  const [remarkInput, setRemarkInput] = useState("");

  // legacy scan state removed; manual item flow in use

  // Derived selected record
  const activeRecord = useMemo(() => (activeBarcode ? records[activeBarcode] : undefined), [records, activeBarcode]);

  // Enumerate available video input devices and keep selection valid
  async function queryDevices() {
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
  }

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

  useEffect(() => {
    // Start or restart camera preview using the selected device (no barcode decoding)
    let unmounted = false;
    const videoEl = videoRef.current;
    let assignedStream: MediaStream | null = null;


    const start = async () => {
      try {
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
  }, [selectedDeviceId]);

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
  }, []);

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
        await fetch(`/api/upload?name=${encodeURIComponent(id)}&ext=${encodeURIComponent(ext)}`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: blob,
        });
      }
    } catch {
      // ignore upload errors
    } finally {
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
    }

    setServerSaving(true);
    setServerError(null);
    try {
      const res = await fetch(RECORDS_ENDPOINT);
      const existing = res.ok ? await res.json() : {};
      const key = (sessionNameInput.trim() || id);
      const merged = { ...(existing || {}), [key]: { items, sessionId: id, videoExt: persistedVideoExt } };
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
        <div className="text-sm text-gray-500">Start a session to add items.</div>
      );
    }
    if (sessionItemIds.length === 0) {
      return (
        <div className="text-sm text-gray-500">No items yet. Enter an item name and click Add item.</div>
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
                <div className="font-medium">{rec.name || "(unnamed)"}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border"
                    onClick={() => setActiveBarcode(id)}
                  >
                    Select
                  </button>
                  <div className="text-xs text-gray-500">{rec.remarks.length} remarks</div>
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
      <h1 className="text-xl font-semibold">Record</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <button
            type="button"
            onClick={startSession}
            className="px-4 py-2 rounded bg-green-600 text-white disabled:bg-gray-300"
            disabled={serverSaving}
          >
            Start record
          </button>
        ) : (
          <button
            type="button"
            onClick={stopSession}
            className="px-4 py-2 rounded bg-red-600 text-white disabled:bg-gray-300"
            disabled={serverSaving}
          >
            Stop & Save
          </button>
        )}
        {isRecording && (
          <span className="text-sm text-red-600">Recording… Session: {sessionId}</span>
        )}
        {serverSaving && <span className="text-sm text-gray-600">Saving to server…</span>}
        {serverError && <span className="text-sm text-red-600">{serverError}</span>}
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Camera preview + Inputs */}
        <div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">Camera device</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white disabled:bg-gray-100"
                value={selectedDeviceId ?? ""}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
              >
                {cameraDevices.length === 0 ? (
                  <option value="">Default camera</option>
                ) : (
                  cameraDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Camera"}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              onClick={() => queryDevices()}
              className="px-3 py-2 rounded border"
            >
              Refresh
            </button>
          </div>
          <div className="aspect-video w-full bg-black/80 rounded overflow-hidden flex items-center justify-center">
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
              <span>Camera is active (preview only).</span>
            ) : (
              <span>Starting camera…</span>
            )}
          </div>

          {/* Session name and add item flow */}
          {isRecording && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">Session name</label>
                <input
                  type="text"
                  value={sessionNameInput}
                  onChange={(e) => setSessionNameInput(e.target.value)}
                  placeholder="Enter session name"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">New item name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={sessionNameInput.trim() ? "Type item name" : "Enter session name first"}
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
                    Add item
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm mb-1">Add remark</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  placeholder={activeBarcode ? "Type remark and press Add" : "Add an item first"}
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
                  Add
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {activeBarcode ? (
                <span>
                  Active item: <span className="font-mono">{activeBarcode}</span>. Use Start/Stop to control the session.
                </span>
              ) : (
                <span>No active item.</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: History */}
        <div className="border border-gray-200 rounded p-4 bg-white/50">
          <h2 className="text-lg font-medium">Item history</h2>
          <div className="mt-3">{rightPanelContent}</div>
        </div>
      </div>
    </div>
  );
}


