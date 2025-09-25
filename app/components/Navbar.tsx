import Link from "next/link";

export default function Navbar() {
  return (
    <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-40">
      <nav className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold">SVI</Link>
          <span className="hidden sm:inline text-gray-300">|</span>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <Link href="/record" className="hover:underline">Record</Link>
            <Link href="/report" className="hover:underline">Report</Link>
            <Link href="/report-table" className="hover:underline">Report Table</Link>
          </div>
        </div>
        <div className="sm:hidden flex items-center gap-3 text-sm">
          <Link href="/record" className="hover:underline">Record</Link>
          <Link href="/report" className="hover:underline">Report</Link>
          <Link href="/report-table" className="hover:underline">Table</Link>
        </div>
      </nav>
    </header>
  );
}


