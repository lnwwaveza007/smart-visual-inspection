import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const parentId = searchParams.get("parentId"); // null or folder id
        const token = req.cookies.get("drive_token")?.value;
        if (!token) {
            return NextResponse.json({ error: "No Drive token" }, { status: 401 });
        }
        const parentExpr = parentId ? `'${parentId}' in parents` : `'root' in parents`;
        const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentExpr}`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=200`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            return NextResponse.json({ error: `Drive list failed ${res.status}` }, { status: res.status });
        }
        const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
        return NextResponse.json({ folders: data.files || [] });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}


