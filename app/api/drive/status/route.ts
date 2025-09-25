import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const token = req.cookies.get("drive_token")?.value || null;
    return NextResponse.json({ authed: Boolean(token) });
}


