"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export default function RecordPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const [records, setRecords] = useState<RecordsIndex>({});
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [firstBarcodeOfSession, setFirstBarcodeOfSession] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [remarkInput, setRemarkInput] = useState("");

  const lastScanValueRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  // Derived selected record
  const activeRecord = useMemo(() => (activeBarcode ? records[activeBarcode] : undefined), [records, activeBarcode]);

  useEffect(() => {
    // Load saved records on mount
    const loaded = loadRecords();
    setRecords(loaded);
  }, []);

  useEffect(() => {
    // Autofocus barcode input for hardware scanners
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Sync name input when active record changes
    setNameInput(activeRecord?.name ?? "");
  }, [activeRecord?.name]);

  useEffect(() => {
    // Start camera preview only (no barcode decoding)
    let unmounted = false;
    const videoEl = videoRef.current;
    let assignedStream: MediaStream | null = null;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (unmounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoEl) {
          (videoEl as unknown as { srcObject: MediaStream | null }).srcObject = stream as MediaStream;
          await videoEl.play();
          assignedStream = stream;
        }
        setCameraActive(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Camera error";
        setCameraError(message);
        setCameraActive(false);
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

  function handleScan(scanned: string) {
    // Throttle duplicates within 1500ms
    const now = Date.now();
    if (scanned === lastScanValueRef.current && now - lastScanTimeRef.current < 1500) {
      return;
    }
    lastScanValueRef.current = scanned;
    lastScanTimeRef.current = now;

    // Session rules
    if (!activeBarcode) {
      setActiveBarcode(scanned);
      setFirstBarcodeOfSession(scanned);
      ensureRecord(scanned);
      return;
    }

    if (firstBarcodeOfSession && scanned === firstBarcodeOfSession) {
      // Stop the process when scanning the initial barcode again
      setActiveBarcode(null);
      setFirstBarcodeOfSession(null);
      setNameInput("");
      setRemarkInput("");
      return;
    }

    if (scanned !== activeBarcode) {
      // Switch to new item by scanning next product barcode
      setActiveBarcode(scanned);
      setFirstBarcodeOfSession(scanned);
      ensureRecord(scanned);
    }
  }

  function handleNameSave(nextName: string) {
    if (!activeBarcode) return;
    const rec = ensureRecord(activeBarcode);
    const updated: ItemRecord = { ...rec, name: nextName, updatedAt: Date.now() };
    const next = { ...records, [activeBarcode]: updated };
    setRecords(next);
    saveRecords(next);
  }

  function handleAddRemark() {
    const text = remarkInput.trim();
    if (!text || !activeBarcode) return;
    const rec = ensureRecord(activeBarcode);
    const updated: ItemRecord = {
      ...rec,
      remarks: [...rec.remarks, { text, ts: Date.now() }],
      updatedAt: Date.now(),
    };
    const next = { ...records, [activeBarcode]: updated };
    setRecords(next);
    saveRecords(next);
    setRemarkInput("");
  }

  const rightPanelContent = (() => {
    if (!activeRecord) {
      return (
        <div className="text-sm text-gray-500">
          <p>No active item. Scan a product barcode to start.</p>
          <p className="mt-2">Scan the same first barcode again to stop.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase text-gray-500">Barcode</div>
          <div className="font-mono break-all">{activeRecord.barcode}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Item name</div>
          <div>{activeRecord.name || <span className="text-gray-400">(unnamed)</span>}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">History</div>
          {activeRecord.remarks.length === 0 ? (
            <div className="text-gray-400">No remarks yet.</div>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-auto pr-2">
              {activeRecord.remarks
                .slice()
                .reverse()
                .map((r, idx) => (
                  <li key={idx} className="border border-gray-200 rounded p-2">
                    <div className="text-xs text-gray-500">
                      {new Date(r.ts).toLocaleString()}
                    </div>
                    <div className="whitespace-pre-wrap">{r.text}</div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-xl font-semibold">Record</h1>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Camera preview + Inputs */}
        <div>
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

          <div className="mt-4">
            <label className="block text-sm mb-1">Scan barcode</label>
            <input
              ref={barcodeInputRef}
              type="text"
              inputMode="numeric"
              placeholder="Focus here and scan barcode..."
              className="w-full border border-gray-300 rounded px-3 py-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value) {
                    handleScan(value);
                    (e.target as HTMLInputElement).select();
                  }
                }
              }}
            />
            <div className="mt-2 text-xs text-gray-500">Scan the first barcode again to stop the session.</div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm mb-1">Item name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => handleNameSave(nameInput.trim())}
                placeholder={activeBarcode ? "Enter item name" : "Scan an item first"}
                disabled={!activeBarcode}
                className="w-full border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Add remark</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  placeholder={activeBarcode ? "Type remark and press Add" : "Scan an item first"}
                  disabled={!activeBarcode}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
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
                  disabled={!activeBarcode || !remarkInput.trim()}
                  className="px-4 py-2 rounded bg-gray-900 text-white disabled:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {activeBarcode ? (
                <span>
                  Active item: <span className="font-mono">{activeBarcode}</span>. Scan the same first barcode again to stop.
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


