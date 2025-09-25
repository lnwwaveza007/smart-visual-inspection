import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");
    if (!fileId) {
        return new Response(JSON.stringify({ error: "Missing fileId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const token = req.cookies.get("drive_token")?.value;
    if (!token) {
        return new Response(JSON.stringify({ error: "No Drive token" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    // Forward Range header to support seeking
    const range = req.headers.get("range") || undefined;
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

    const driveResp = await fetch(driveUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            ...(range ? { Range: range } : {}),
        },
    });

    // Pass through status (200/206) and relevant headers for media playback
    const headers = new Headers();
    // Content headers
    const passThroughHeaders = [
        "content-type",
        "content-length",
        "accept-ranges",
        "content-range",
        "cache-control",
        "etag",
        "last-modified",
    ];
    passThroughHeaders.forEach((h) => {
        const v = driveResp.headers.get(h);
        if (v) headers.set(h, v);
    });

    // Stream the body back to the client
    return new Response(driveResp.body, {
        status: driveResp.status,
        headers,
    });
}
