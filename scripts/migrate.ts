import "./env";
import fs from "node:fs";
import { q } from "../lib/db";

(async () => {
  const sql = fs.readFileSync("db/schema.sql", "utf8").replace(/^--.*$/gm, "");
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q(stmt);
  console.log("schema applied");
})().catch((e) => { console.error(e); process.exit(1); });
