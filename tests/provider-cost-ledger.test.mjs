import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

async function policy() {
  return JSON.parse(await read("finance/provider-cost-ledger-template.json"));
}

test("provider-cost ledger policy is a blank fail-closed template", async () => {
  const value = await policy();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.reviewedOn, "2026-07-19");
  assert.equal(value.status, "template_only_owner_input_required");
  assert.equal(value.currency, "USD");
  assert.equal(value.financialDashboardAuthorized, false);
  assert.equal(value.privateReceiptIdPattern, "^FIN-[0-9]{4}-[0-9]{4}$");
  assert.deepEqual(value.ledgerEntries, []);

  const boundary = value.repositoryDataBoundary;
  assert.equal(boundary.actualLedgerRecordsAllowed, false);
  assert.equal(boundary.receiptFilesAllowed, false);
  assert.equal(boundary.privateStorageRequired, true);
  assert.equal(boundary.allowedRepositoryContent.length, 4);
  assert.equal(boundary.prohibitedRepositoryContent.length, 5);
  assert.ok(boundary.prohibitedRepositoryContent.some((item) => /card, bank/u.test(item)));
  assert.ok(boundary.prohibitedRepositoryContent.some((item) => /completed operating-cost rows/u.test(item)));
});

test("workbook contract has exact sheets, fields, controlled aliases, and statuses", async () => {
  const value = await policy();
  assert.equal(value.workbook.file, "finance/templates/CastingCompass-Operating-Cost-Ledger.xlsx");
  assert.match(value.workbook.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(value.workbook.sheets, [
    "Summary",
    "Ledger",
    "Providers",
    "Receipt Register",
    "Checks",
    "Instructions",
  ]);
  assert.equal(value.workbook.reservedLedgerRows, 200);
  assert.equal(value.workbook.entryColumns.length, 15);
  assert.equal(value.workbook.entryColumns[0], "Entry ID");
  assert.equal(value.workbook.entryColumns.at(-1), "Review Status");
  assert.ok(value.providerAliases.includes("Cloudflare"));
  assert.ok(value.providerAliases.includes("GitHub"));
  assert.ok(value.providerAliases.includes("Other"));
  assert.ok(value.categories.includes("Legal/accounting"));
  assert.deepEqual(value.reviewStatuses, ["Unreviewed", "Reconciled", "Disputed"]);
  assert.deepEqual(value.receiptStatuses, [
    "Not assessed",
    "Not expected",
    "Expected",
    "Stored privately",
    "Missing",
  ]);
});

test("committed workbook is a bounded XLSX template and private paths are ignored", async () => {
  const value = await policy();
  const workbookUrl = new URL(value.workbook.file, root);
  const [bytes, metadata, ignore] = await Promise.all([
    readFile(workbookUrl),
    stat(workbookUrl),
    read(".gitignore"),
  ]);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  assert.ok(metadata.size > 10_000 && metadata.size < 500_000);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), value.workbook.sha256);
  assert.match(ignore, /^\/finance\/private\/$/mu);
  assert.match(ignore, /^\/finance\/receipts\/$/mu);
  assert.match(ignore, /^\/finance\/filled\/$/mu);
});

test("owner guide and roadmap preserve the private-record and incomplete boundaries", async () => {
  const [guide, goals] = await Promise.all([
    read("docs/OPERATING-COST-LEDGER.md"),
    read("docs/GOAL_STATUS.md"),
  ]);
  assert.match(guide, /committed workbook is a template only/u);
  assert.match(guide, /Do not upload the completed workbook or source documents to GitHub, Codex/u);
  assert.match(guide, /opaque reference such as `FIN-2026-0001`/u);
  assert.match(guide, /PASS.*means only that the workbook's completeness checks pass/su);
  assert.match(guide, /roadmap item\s+stays open until the owner creates the private copy/su);
  assert.match(goals, /- \[ \] Track operating costs and receipts by provider/u);
  assert.match(goals, /\*\*Local workbook control complete:\*\*/u);
  assert.doesNotMatch(goals, /- \[x\] Track operating costs and receipts by provider/u);
});
