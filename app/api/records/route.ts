import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId, AnyBulkWriteOperation } from "mongodb";

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


