import { MongoClient, Db } from "mongodb";

const DEFAULT_URI = "mongodb://admin:secret123@shared1.bsthun.in:11802";
const uri: string = (process.env.MONGO_URI as string) || DEFAULT_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = MongoClient.connect(uri, {
      // direct connection to a single host
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
    }).then((c) => {
      client = c;
      return c;
    });
  }
  return clientPromise;
}

export async function getDb(dbName: string = "smart-visual-inspection"): Promise<Db> {
  const c = await getMongoClient();
  return c.db(dbName);
}


