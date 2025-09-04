import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const name = searchParams.get("name");
        const ext = (searchParams.get("ext") || "webm").replace(/[^a-z0-9]/gi, "");
        if (!name) {
            return NextResponse.json({ error: "Missing name" }, { status: 400 });
        }
        const arrayBuffer = await req.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const videosDir = path.join(process.cwd(), "public", "videos");
        await fs.mkdir(videosDir, { recursive: true });
        const filePath = path.join(videosDir, `${name}.${ext}`);
        await fs.writeFile(filePath, buffer);

        return NextResponse.json({ ok: true, path: `/videos/${name}.${ext}` });
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}


