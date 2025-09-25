"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "./Modal";

export default function DriveAuthGate() {
  const t = useTranslations("drive");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/drive/status", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const ok = Boolean(json?.authed);
        setAuthed(ok);
        setModalOpen(!ok);
      } catch {
        if (!alive) return;
        setAuthed(false);
        setModalOpen(true);
      }
    };
    check();
    return () => { alive = false; };
  }, []);

  async function ensureDriveToken(): Promise<void> {
    try {
      setBusy(true);
      setError(null);
      const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string) || "";
      if (!clientId) {
        setError(t("missingClientId"));
        return;
      }
      // Load GIS if needed
      if (!(window as unknown as { google?: unknown }).google) {
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
      type TokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };
      interface GoogleGlobal { accounts?: { oauth2?: { initTokenClient?: (args: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
      }) => TokenClient } } }
      const googleGlobal = (window as unknown as { google?: GoogleGlobal }).google;
      const oauth2 = googleGlobal?.accounts?.oauth2;
      if (!oauth2?.initTokenClient) {
        setError(t("unavailable"));
        return;
      }
      const scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      ].join(" ");
      await new Promise<void>((resolve) => {
        const init = oauth2.initTokenClient!;
        const client = init({
          client_id: clientId,
          scope: scopes,
          prompt: "consent",
          callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
            if (resp?.error) {
              setError(resp.error);
            } else {
              try {
                const t = resp.access_token || "";
                const expiresInSec = Math.max(1, Number(resp?.expires_in || 0));
                if (t) {
                  void fetch("/api/drive/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken: t, expiresInSec }),
                  }).then(() => {
                    setAuthed(true);
                    setModalOpen(false);
                  });
                }
              } catch {}
            }
            resolve();
          },
        });
        client.requestAccessToken();
      });
    } finally {
      setBusy(false);
    }
  }

  // Silent refresh: try to refresh token without re-prompt periodically
  useEffect(() => {
    let stop = false;
    let refreshTimer: number | null = null;

    const setupSilentRefresh = async () => {
      const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string) || "";
      if (!clientId) return;
      if (!(window as unknown as { google?: unknown }).google) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://accounts.google.com/gsi/client";
          s.async = true;
          s.defer = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Google script"));
          document.head.appendChild(s);
        });
      }
      type TokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };
      interface GoogleGlobal { accounts?: { oauth2?: { initTokenClient?: (args: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
      }) => TokenClient } } }
      const googleGlobal = (window as unknown as { google?: GoogleGlobal }).google;
      const oauth2 = googleGlobal?.accounts?.oauth2;
      if (!oauth2?.initTokenClient) return;
      const scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      ].join(" ");

      const client = oauth2.initTokenClient!({
        client_id: clientId,
        scope: scopes,
        prompt: "none",
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
          if (resp?.access_token) {
            const expiresInSec = Math.max(1, Number(resp?.expires_in || 300));
            void fetch("/api/drive/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken: resp.access_token, expiresInSec }),
            }).then(() => {
              setAuthed(true);
            }).catch(() => {});
          }
        },
      });

      const schedule = () => {
        // Refresh every 4 minutes to keep cookie alive (server stores maxAge given)
        const intervalMs = 4 * 60 * 1000;
        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = window.setInterval(() => {
          if (stop) return;
          try {
            client.requestAccessToken({ prompt: "none" });
          } catch {}
        }, intervalMs);
      };

      schedule();
    };

    // Only set up when authed (we have a cookie) to avoid unnecessary prompts
    if (authed) {
      void setupSilentRefresh();
    }

    return () => {
      stop = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [authed]);

  if (authed === null) return null;
  return (
    <Modal
      open={!authed && modalOpen}
      title={t("connectTitle")}
      onClose={() => setModalOpen(false)}
      footer={(
        <>
          <button type="button" className="px-3 py-1.5 rounded border" onClick={() => setModalOpen(false)} disabled={busy}>
            {t("notNow")}
          </button>
          <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white" onClick={ensureDriveToken} disabled={busy}>
            {busy ? t("signingIn") : t("signIn")}
          </button>
        </>
      )}
    >
      <div className="space-y-2 text-sm">
        <p>{t("explain")}</p>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}


