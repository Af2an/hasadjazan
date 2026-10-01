// A real Postgres engine in memory (PGlite) behind server/repo.js, for tests and local preview.
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createRepo } from "../server/repo.js";

export async function createTestRepo() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"));
  const query = async (text, params) => {
    const r = await pg.query(text, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  };
  // one connection: transactions run one after another, which is enough here
  return { pg, repo: createRepo({ query, connect: async () => ({ query, release() {} }) }) };
}
