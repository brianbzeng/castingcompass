import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyProject } from "../scripts/verify-authorship-provenance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixturePaths = [
  "app/data/structure-images.json",
  "contracts/authorship-provenance.schema.json",
  "docs/AUTHORSHIP-AND-PROVENANCE.md",
  "docs/STRUCTURE_IMAGE_SOURCES.md",
  "docs/structure-image-audit.md",
  "governance/authorship-provenance.json",
  "public",
  "security/authorship-provenance-policy.json",
  "security/authorship-provenance-report.json",
];

function fixture() {
  const destination = mkdtempSync(join(tmpdir(), "castingcompass-provenance-"));
  for (const repositoryPath of fixturePaths) {
    const target = join(destination, repositoryPath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, repositoryPath), target, { recursive: true });
  }
  return destination;
}

function readJson(project, path) {
  return JSON.parse(readFileSync(join(project, path), "utf8"));
}

function writeJson(project, path, value) {
  writeFileSync(join(project, path), `${JSON.stringify(value, null, 2)}\n`);
}

function withFixture(callback) {
  const project = fixture();
  try {
    callback(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("the committed public-safe provenance report is deterministic and production-closed", () => {
  const checked = verifyProject(root, { reportMode: "check" });
  const rebuilt = verifyProject(root, { reportMode: "none" });
  assert.deepEqual(checked, rebuilt);
  assert.equal(checked.visualAssetCount, 36);
  assert.equal(checked.thirdPartyRecordCount, 7);
  assert.equal(checked.candidateReviewRequiredRecordCount, 4);
  assert.deepEqual(checked.candidateReviewRequiredPaths, [
    "public/marketing/actors/boat-fisherman.webp",
    "public/marketing/actors/diving-helmet.webp",
    "public/marketing/actors/foreground-kelp.webp",
    "public/marketing/actors/helmet-fish.webp",
    "public/marketing/actors/seafloor-compass.webp",
    "public/marketing/actors/seafloor-crab.webp",
    "public/marketing/actors/shark.webp",
    "public/marketing/painterly-shoreline.webp",
    "public/marketing/painterly-water-column.webp",
    "public/marketing/silhouettes/angler-left.webp",
    "public/marketing/silhouettes/angler-right.webp",
    "public/marketing/silhouettes/cliff-seaweed.webp",
    "public/marketing/silhouettes/school-left.webp",
    "public/marketing/silhouettes/school-right.webp",
    "public/marketing/silhouettes/seabed-full.webp",
    "public/marketing/silhouettes/spearfisher-far.webp",
    "public/marketing/silhouettes/spearfisher-near.webp",
    "public/marketing/silhouettes/squid-lower.webp",
    "public/marketing/silhouettes/squid-upper.webp",
    "public/marketing/silhouettes/whale.webp",
    "public/marketing/spearfishers-pair.webp",
  ]);
  assert.equal(checked.legacyReviewRequiredPaths.length, 8);
  assert.equal(checked.allVisualAssetsRegistered, true);
  assert.equal(checked.liveAttributionVerified, true);
  assert.equal(checked.privateEvidenceIncluded, false);
  assert.equal(checked.productionReadiness, false);
});

test("the strict schema and private-data boundary reject extra or sensitive record content", () => {
  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    register.records[0].contact_email = "owner@example.invalid";
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /schema validation failed/u,
    );
  });

  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    register.records[0].evidence_refs.push("owner@example.invalid");
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /forbidden private or secret-shaped data/u,
    );
  });
});

test("asset discovery fails closed on an unregistered file, symlink, or hash drift", () => {
  withFixture((project) => {
    writeFileSync(
      join(project, "public/unregistered.png"),
      "not-a-reviewed-image",
    );
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /Visual asset inventory differs/u,
    );
  });

  withFixture((project) => {
    symlinkSync("favicon.svg", join(project, "public/alias.svg"));
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /contains a symlink/u,
    );
  });

  withFixture((project) => {
    writeFileSync(join(project, "public/favicon.svg"), "\n", { flag: "a" });
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /does not match its registered SHA-256/u,
    );
  });
});

test("new legacy exceptions, candidate overclaims, duplicate paths, and license drift are rejected", () => {
  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    register.records.find(
      (record) => record.id === "structure-eelgrass",
    ).release_state = "legacy_review_required";
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /cannot use a legacy release state/u,
    );
  });

  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    register.records.find(
      (record) => record.id === "marketing-spearfishers-pair",
    ).release_state = "approved_existing_use";
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /must remain candidate review required/u,
    );
  });

  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    const duplicate = structuredClone(
      register.records.find((record) => record.id === "brand-raster-mark")
        .paths[0],
    );
    register.records
      .find((record) => record.id === "brand-vector-marks")
      .paths.unshift(duplicate);
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /registered more than once/u,
    );
  });

  withFixture((project) => {
    const register = readJson(project, "governance/authorship-provenance.json");
    register.records.find(
      (record) => record.id === "structure-sandbar",
    ).license_url = "https://example.invalid/license";
    writeJson(project, "governance/authorship-provenance.json", register);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /license URL is not canonical/u,
    );
  });
});

test("live and documented attribution cannot drift from registered source evidence", () => {
  withFixture((project) => {
    const images = readJson(project, "app/data/structure-images.json");
    images["sand-bar"].credit = "Wrong creator";
    writeJson(project, "app/data/structure-images.json", images);
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /credit drifted from the register/u,
    );
  });

  withFixture((project) => {
    const audit = join(project, "docs/structure-image-audit.md");
    writeFileSync(
      audit,
      readFileSync(audit, "utf8").replace("Frank Kovalchek", "Unknown creator"),
    );
    assert.throws(
      () => verifyProject(project, { reportMode: "none" }),
      /documentation is missing structure-sandbar evidence/u,
    );
  });
});
