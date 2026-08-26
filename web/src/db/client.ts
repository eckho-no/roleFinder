import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Wraps a resolved D1 binding (`env.DB` or `env.DEMO_DB`) in a typed Drizzle client. */
export function getDb(binding: D1Database) {
  return drizzle(binding, { schema });
}
