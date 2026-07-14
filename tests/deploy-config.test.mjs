import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));

test("generated Cloudflare configuration has unique compatibility flags", () => {
  const flags = config.compatibility_flags ?? [];
  assert.deepEqual(flags, [...new Set(flags)]);
  assert.equal(flags.filter((flag) => flag === "nodejs_compat").length, 1);
});

test("generated Cloudflare configuration has one production D1 binding", () => {
  const databases = config.d1_databases ?? [];
  assert.equal(databases.length, 1);
  assert.equal(databases[0].binding, "DB");
  assert.equal(databases[0].database_name, "contourcast-trips");
});
