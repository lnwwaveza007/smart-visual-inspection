import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl sm:text-4xl font-semibold text-center">{t("heading")}</h1>
      <div className="mt-8 w-full max-w-md">
        <h2 className="text-sm uppercase text-gray-500">{t("routes")}</h2>
        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/record"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              {t("record")}
            </Link>
          </li>
          <li>
            <Link
              href="/report"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              {t("report")}
            </Link>
          </li>
          <li>
            <Link
              href="/report-table"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              {t("reportTable")}
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
