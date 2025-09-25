import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { accessToken, expiresInSec } = (await req.json()) as { accessToken?: string; expiresInSec?: number };
        if (!accessToken) {
            return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
        }
        const maxAge = Math.max(1, Number(expiresInSec || 300));
        const res = NextResponse.json({ ok: true });
        const isProd = process.env.NODE_ENV === "production";
        res.cookies.set("drive_token", accessToken, {
            httpOnly: true,
            secure: isProd, // allow non-secure in dev so cookie is sent on http://localhost
            sameSite: "lax",
            path: "/",
            maxAge,
        });
        return res;
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}


