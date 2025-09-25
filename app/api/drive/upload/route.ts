import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const token = req.cookies.get("drive_token")?.value;
        if (!token) {
            return NextResponse.json({ error: "No Drive token" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const name = searchParams.get("name");
        const parentId = searchParams.get("parentId");
        if (!name) {
            return NextResponse.json({ error: "Missing name" }, { status: 400 });
        }

        // Read raw bytes from body (video blob)
        const mimeType = req.headers.get("content-type") || "application/octet-stream";
        const fileBytes = new Uint8Array(await req.arrayBuffer());

        // Build multipart/related body for Drive upload
        const boundary = `svi-${Math.random().toString(36).slice(2)}`;
        const metadata: Record<string, unknown> = {
            name,
            mimeType,
            ...(parentId ? { parents: [parentId] } : {}),
        };
        const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
        const fileHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const closing = `\r\n--${boundary}--\r\n`;

        const encoder = new TextEncoder();
        const bodyParts = [
            encoder.encode(preamble),
            encoder.encode(fileHeader),
            fileBytes,
            encoder.encode(closing),
        ];

        // Concatenate parts into a single Uint8Array
        const totalLength = bodyParts.reduce((sum, part) => sum + part.byteLength, 0);
        const multipartBody = new Uint8Array(totalLength);
        let offset = 0;
        for (const part of bodyParts) {
            multipartBody.set(part, offset);
            offset += part.byteLength;
        }

        const driveRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
        });

        if (!driveRes.ok) {
            const msg = await driveRes.text().catch(() => "");
            const status = driveRes.status || 500;
            return NextResponse.json({ error: `Drive upload failed ${status}`, details: msg }, { status });
        }

        const json = await driveRes.json();
        return NextResponse.json(json);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
    }
}


