import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

type RecordsMap = Record<string, unknown>;

function ensureObject(input: unknown): RecordsMap {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as RecordsMap;
  }
  return {};
}

export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection("records");
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
    const collection = db.collection("records");

    const entries = Object.entries(body);
    if (entries.length === 0) {
      return NextResponse.json({});
    }

    const operations = entries.map(([id, value]) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: value },
        upsert: true,
      },
    }));
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


