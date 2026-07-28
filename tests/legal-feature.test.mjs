import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authPath = new URL("../worker/auth.ts", import.meta.url);
const accountPath = new URL("../app/components/AccountFeature.tsx", import.meta.url);
const opportunityPath = new URL("../app/components/OpportunityApp.tsx", import.meta.url);
const privacyPath = new URL("../app/privacy/page.tsx", import.meta.url);
const termsPath = new URL("../app/terms/page.tsx", import.meta.url);
const aiPath = new URL("../app/ai-disclosure/page.tsx", import.meta.url);
const legalPagePath = new URL("../app/components/LegalPage.tsx", import.meta.url);

test("account creation enforces age eligibility and versioned legal acceptance", async () => {
  const [auth, account, legalPage] = await Promise.all([
    readFile(authPath, "utf8"),
    readFile(accountPath, "utf8"),
    readFile(legalPagePath, "utf8"),
  ]);

  assert.match(auth, /MINIMUM_ACCOUNT_AGE = 13/);
  assert.match(auth, /evaluateAgeEligibility\(body\.birthDate\)/);
  assert.match(auth, /assertSignupLegalAcceptance\(body\)/);
  assert.match(auth, /ageEligible: Boolean\(row\.age_eligible\)/);
  assert.match(auth, /age_eligibility_confirmed_at/);
  assert.doesNotMatch(auth, /birth_date\s+TEXT|INSERT INTO [^(]+\([^)]*birth_date/);
  assert.match(account, /I agree to the/);
  assert.match(account, /Terms of Service/);
  assert.match(account, /Privacy Policy/);
  assert.match(account, /submitLegalAcceptance/);
  assert.match(account, /Account features<br \/>paused/);
  assert.match(auth, /LEGAL_VERSION = "2026-07-27\.1"/);
  assert.match(legalPage, /LEGAL_EFFECTIVE_DATE = "July 27, 2026"/);
  assert.match(legalPage, /LEGAL_DOCUMENT_VERSION = "2026-07-27\.1"/);
  assert.match(legalPage, /LEGAL_SUPPORT_EMAIL = "support@castingcompass\.com"/);
});

test("privacy controls provide export, deletion, and an optional location notice", async () => {
  const [auth, account] = await Promise.all([
    readFile(authPath, "utf8"),
    readFile(accountPath, "utf8"),
  ]);

  assert.match(auth, /\/api\/profile\/export/);
  assert.match(auth, /request\.method === "DELETE"/);
  assert.match(account, /Download my account records \(JSON\)/);
  assert.match(account, /Delete account/);
});

test("public legal pages separate forecast limitations, privacy, and automated review", async () => {
  const [privacy, terms, ai] = await Promise.all([
    readFile(privacyPath, "utf8"),
    readFile(termsPath, "utf8"),
    readFile(aiPath, "utf8"),
  ]);

  assert.match(privacy, /entered birth date is not retained/);
  assert.match(privacy, /do not currently sell personal information, share it/);
  assert.match(privacy, /request already authorized or transmitted before deletion cannot be recalled/);
  assert.match(terms, /It does not mean an 80% chance of catching a fish/);
  assert.match(terms, /not navigational data/);
  assert.match(ai, /hybrid planning and relative-ranking system/);
  assert.match(ai, /not a catch probability/);
  assert.doesNotMatch(ai, /updatedDate=|documentVersion=/);
  assert.match(ai, /has not activated a prospective validation study/);
  assert.match(ai, /eligible prospective or confirmatory validation sample/);
  assert.match(ai, /preregistered baseline comparisons/);
  assert.match(ai, /probability-calibration runs/);
  assert.match(ai, /was reliably worse than simpler classical structure summaries/);
  assert.match(ai, /not evidence about the live Opportunity Score/);
  assert.match(ai, /response cannot restore the deleted trip or publish a post/);
  assert.match(ai, /Trip reports do not automatically change the live score or enter formal model evaluation/);
});

test("public support surfaces use a role address and legal copy uses category-based disclosures", async () => {
  const [privacy, terms, ai, legalPage, account, opportunity] = await Promise.all([
    readFile(privacyPath, "utf8"),
    readFile(termsPath, "utf8"),
    readFile(aiPath, "utf8"),
    readFile(legalPagePath, "utf8"),
    readFile(accountPath, "utf8"),
    readFile(opportunityPath, "utf8"),
  ]);
  const publicSupportCopy = [privacy, terms, ai, legalPage, account, opportunity].join("\n");
  const publicLegalCopy = [privacy, terms, ai, legalPage].join("\n");

  assert.match(publicSupportCopy, /support@castingcompass\.com/);
  assert.doesNotMatch(
    publicSupportCopy,
    /Brian Zeng|bzeng0000@gmail\.com|brianzeng\.com|github\.com\/brianbzeng|linkedin\.com\/in\/brianbzeng/,
  );
  assert.doesNotMatch(
    publicLegalCopy,
    /Cloudflare|Resend|Xiaomi MiMo|Have I Been Pwned|Google Maps/,
  );
  assert.match(privacy, /Infrastructure and security providers/);
  assert.match(privacy, /Automated-processing providers/);
  assert.match(terms, /intended to disrupt, manipulate, test, or circumvent/);
  assert.match(terms, /permanently delete accounts/);
});
