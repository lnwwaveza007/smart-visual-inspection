"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navbar() {
  const t = useTranslations("nav");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const res = await fetch("/api/drive/status", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const ok = Boolean(json?.authed);
        setAuthed(ok);
        if (ok) {
          try {
            const me = await fetch("/api/drive/me", { cache: "no-store" });
            const data = await me.json();
            if (!alive) return;
            setEmail(typeof data?.email === "string" ? data.email : null);
          } catch {
            if (!alive) return;
            setEmail(null);
          }
        } else {
          setEmail(null);
        }
      } catch {
        if (!alive) return;
        setAuthed(false);
        setEmail(null);
      }
    };
    sync();
    const onAuth = (e: Event) => {
      const detail = (e as CustomEvent).detail as { authed?: boolean } | undefined;
      if (typeof detail?.authed === "boolean") {
        const ok = detail.authed;
        setAuthed(ok);
        if (ok) {
          void (async () => {
            try {
              const me = await fetch("/api/drive/me", { cache: "no-store" });
              const data = await me.json();
              setEmail(typeof data?.email === "string" ? data.email : null);
            } catch {
              setEmail(null);
            }
          })();
        } else {
          setEmail(null);
        }
      }
    };
    window.addEventListener("svi:drive:auth", onAuth as EventListener);
    return () => {
      alive = false;
      window.removeEventListener("svi:drive:auth", onAuth as EventListener);
    };
  }, []);
  async function handleSignOut() {
    try {
      await fetch("/api/drive/logout", { method: "POST" });
      // Simple way to refresh Drive auth state across app
      window.location.reload();
    } catch {}
  }
  return (
    <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-40">
      <nav className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold">{t("brand")}</Link>
          <span className="hidden sm:inline text-gray-300">|</span>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <Link href="/record" className="hover:underline">{t("record")}</Link>
            <Link href="/report" className="hover:underline">{t("report")}</Link>
            <Link href="/report-table" className="hover:underline">{t("reportTable")}</Link>
          </div>
        </div>
        <div className="sm:hidden flex items-center gap-3 text-sm">
          <Link href="/record" className="hover:underline">{t("record")}</Link>
          <Link href="/report" className="hover:underline">{t("report")}</Link>
          <Link href="/report-table" className="hover:underline">{t("table")}</Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <div className="sm:hidden">
            <LanguageSwitcher />
          </div>
          {authed && email && (
            <span className="hidden sm:inline text-sm text-gray-600" title={email}>{email}</span>
          )}
          {authed ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              aria-label={t("signOut", { fallback: "Sign out" })}
            >
              {t("signOut", { fallback: "Sign out" })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                try { window.dispatchEvent(new Event("svi:drive:openSignIn")); } catch {}
              }}
              className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              aria-label={t("login", { fallback: "Login" })}
            >
              {t("login", { fallback: "Login" })}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}


