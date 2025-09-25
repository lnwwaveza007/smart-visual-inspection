"use client";

import {useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";

export default function LanguageSwitcher() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("nav");

  async function setLocaleCookie(nextLocale: "th" | "en") {
    // Write cookie via a lightweight client action by calling a route
    // Avoids needing a form action and maintains simplicity
    await fetch("/api/locale", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({locale: nextLocale}),
      cache: "no-store"
    });
  }

  function handleSwitch(nextLocale: "th" | "en") {
    startTransition(async () => {
      await setLocaleCookie(nextLocale);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleSwitch("th")}
        className="px-2 py-1 text-xs rounded border hover:bg-gray-50 disabled:opacity-50"
        disabled={isPending}
        aria-label={t("switchToThai")}
        title={t("thai")}
      >
        {t("switchToThai")}
      </button>
      <button
        type="button"
        onClick={() => handleSwitch("en")}
        className="px-2 py-1 text-xs rounded border hover:bg-gray-50 disabled:opacity-50"
        disabled={isPending}
        aria-label={t("switchToEnglish")}
        title={t("english")}
      >
        {t("switchToEnglish")}
      </button>
    </div>
  );
}


