import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl sm:text-4xl font-semibold text-center">Smart Visual Inspection</h1>
      <div className="mt-8 w-full max-w-md">
        <h2 className="text-sm uppercase text-gray-500">Routes</h2>
        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/record"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              /record — Record and history
            </Link>
          </li>
          <li>
            <Link
              href="/report"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              /report — Reports viewer
            </Link>
          </li>
          <li>
            <Link
              href="/report-table"
              className="block w-full border border-gray-300 rounded px-4 py-3 hover:bg-gray-50"
            >
              /report-table — Report as table
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
