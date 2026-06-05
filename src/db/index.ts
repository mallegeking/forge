import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// libsql client. Locally this is a `file:` URL (SQLite on disk); in production
// it points at a Turso database via env. The same code serves both, which is
// what makes multi-device cloud sync possible without a rewrite.
const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
