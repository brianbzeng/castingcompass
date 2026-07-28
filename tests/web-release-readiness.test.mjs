import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readiness = readFileSync(new URL("../docs/WEB-RELEASE-READINESS.md", import.meta.url), "utf8");
const packet = readFileSync(new URL("../docs/WEB-RELEASE-REVIEWER-PACKET.md", import.meta.url), "utf8");

test("web release checklist preserves the independent-review and production stop gates", () => {
  assert.match(readiness, /blocked before independent review/i);
  assert.match(readiness, /Every item below is \*\*review-gated\*\* and unexecuted/);
  assert.match(readiness, /Nothing in this document authorizes a[\s\S]*schema-changing production migration/);
  assert.match(readiness, /No application Worker/);
  assert.match(readiness, /Previously completed setup does\s+not need to be repeated/);
});

test("review packet requires exact identities, staging evidence, and separate authorization", () => {
  assert.match(packet, /one exact 40-character draft-PR head/);
  assert.match(packet, /verifier intentionally rejects a branch commit/);
  assert.match(packet, /The repository's local tests and templates do not satisfy this section/);
  assert.match(packet, /Review approval does not itself execute or authorize production/);
  assert.match(packet, /\*\*reject\*\*, \*\*changes required\*\*, or \*\*ready for separately authorized/);
});

test("release documents keep model and legal claims truthful", () => {
  for (const document of [readiness, packet]) {
    assert.match(document, /hybrid planning(?: and|\/)ranking/i);
    assert.match(document, /not a\s+catch probability/i);
    assert.match(document, /undeployed deep-learning/i);
    assert.match(document, /legal advice/i);
  }
});
