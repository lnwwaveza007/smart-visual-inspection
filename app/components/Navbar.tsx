"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navbar() {
  const t = useTranslations("nav");
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
        </div>
      </nav>
    </header>
  );
}


