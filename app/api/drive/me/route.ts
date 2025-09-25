import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("drive_token")?.value || null;
    if (!token) return NextResponse.json({ authed: false }, { status: 200 });

    // Use Google Drive about endpoint to get user info
    const resp = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)&alt=json", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ authed: true, error: `HTTP ${resp.status}` }, { status: 200 });
    }
    const data = await resp.json() as { user?: { emailAddress?: string; displayName?: string } };
    const email = data?.user?.emailAddress || null;
    const name = data?.user?.displayName || null;
    return NextResponse.json({ authed: true, email, name });
  } catch (e: unknown) {
    return NextResponse.json({ authed: false, error: e instanceof Error ? e.message : "Failed" }, { status: 200 });
  }
}


