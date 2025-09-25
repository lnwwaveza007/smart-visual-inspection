import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId, AnyBulkWriteOperation } from "mongodb";
import fs from "node:fs/promises";
import path from "node:path";

type RecordsMap = Record<string, unknown>;
type RecordDoc = { _id: ObjectId | string } & Record<string, unknown>;

function ensureObject(input: unknown): RecordsMap {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as RecordsMap;
  }
  return {};
}

export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection<RecordDoc>("records");
    const docs = await collection.find({}).toArray();
    const map = Object.fromEntries(
      docs.map((d) => [String(d._id), (() => {
        const { _id, ...rest } = d as Record<string, unknown>;
        return rest;
      })()])
    );
    return NextResponse.json(map);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = ensureObject(await req.json());
    const db = await getDb();
    const collection = db.collection<RecordDoc>("records");

    const entries = Object.entries(body);
    if (entries.length === 0) {
      return NextResponse.json({});
    }

    const operations: AnyBulkWriteOperation<RecordDoc>[] = entries.map(([id, value]) => {
      const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
      const updateValue = ensureObject(value) as Partial<RecordDoc>;
      return {
        updateOne: {
          filter: { _id },
          update: { $set: updateValue },
          upsert: true,
        },
      };
    });
    await collection.bulkWrite(operations, { ordered: false });

    // Return the latest state from the database
    const docs = await collection.find({}).toArray();
    const map = Object.fromEntries(
      docs.map((d) => [String(d._id), (() => {
        const { _id, ...rest } = d as Record<string, unknown>;
        return rest;
      })()])
    );
    return NextResponse.json(map);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const db = await getDb();
    const collection = db.collection<RecordDoc>("records");
    const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const existing = await collection.findOne({ _id } as unknown as Record<string, unknown>);

    let deletedDrive = false;
    let deletedLocal = false;

    // Try deleting associated video first (best-effort)
    const videoSource = (existing as Record<string, unknown> | null)?.["videoSource"] as string | undefined;
    if (videoSource === "drive") {
      const driveFileId = (existing as Record<string, unknown> | null)?.["driveFileId"] as string | undefined;
      const token = req.cookies.get("drive_token")?.value;
      if (driveFileId && token) {
        try {
          const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          deletedDrive = resp.status === 204 || resp.ok;
        } catch {
          deletedDrive = false;
        }
      }
    } else {
      const sessionId = (existing as Record<string, unknown> | null)?.["sessionId"] as string | undefined;
      const videoExt = ((existing as Record<string, unknown> | null)?.["videoExt"] as string | undefined) || "webm";
      if (sessionId) {
        const filePath = path.join(process.cwd(), "public", "videos", `${sessionId}.${videoExt}`);
        try {
          await fs.unlink(filePath);
          deletedLocal = true;
        } catch {
          // ignore if file missing or cannot delete
        }
      }
    }

    const res = await collection.deleteOne({ _id } as unknown as Record<string, unknown>);
    return NextResponse.json({ deletedCount: res.deletedCount ?? 0, deletedDrive, deletedLocal });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
  }
}


