# Production change authorization

CastingCompass production mutations fail closed before Wrangler starts. A clean checkout and
`RELEASE_COMMIT` are necessary but no longer sufficient: every Worker deployment and every
staged D1 mutation requires one short-lived private authorization packet for one exact action.

This repository control does **not** authorize a production release by itself. The current
production release is still blocked by the open provider, key-custody, notification, independent-
review, live-host, migration, and smoke-test gates in [Production operations](PRODUCTION-OPERATIONS.md).
Never create a packet merely to make the verifier pass.

## Fixed boundary

The checked-in policy is
[`security/production-change-authorization-policy.json`](../security/production-change-authorization-policy.json).
CI verifies its locked hash and semantics without reading any private packet. The policy fixes:

- repository, production environment, Worker, and primary D1 identity;
- a maximum six-hour authorization window;
- separate `operator` and `independent_reviewer` approvals;
- the one permitted safety-floor commit;
- one action for every safety-floor, maintenance, normal, and later abuse-control activation
  deployment; and
- one action for `0007` reconciliation and each exact `0009`–`0020` migration; and
- one action for the fixed production `PRAGMA optimize` operation before normal traffic.

The verifier requires full lowercase 40-character release and gate commits. Each verified
checkout must be clean, belong to the official `brianbzeng/castingcompass` origin, and be
reachable from its locally reviewed `origin/main` ref. Normal, maintenance, and D1 actions use
the same commit for both fields. The historical safety-floor action binds the pinned target
commit and the current full-release checkout that supplies the gate. An abbreviated SHA, fork
remote, unreviewed branch commit, dirty worktree, local environment override, wrong action, or
incomplete packet is rejected before provider work.

## Private packet

Store the packet on an encrypted, access-restricted volume outside every release checkout. It
must be a regular owner-owned file, inaccessible to group/other users, no larger than 64 KiB,
and neither a symbolic nor hard link. The verifier also refuses a file whose identity changes
while it is opened or read. Keep secret values, user data, provider IDs, version IDs, Time Travel
bookmarks, email addresses, and raw logs out of it. The packet contains only public resource
identity, UTC timestamps, a UUID, and SHA-256 references to separately protected evidence.

The JSON must use the exact field order below, two-space indentation, and a final newline.
Placeholders deliberately do not pass validation:

```json
{
  "schema_version": "castingcompass.production-change-authorization/1.0.0",
  "authorization_id": "REPLACE_WITH_LOWERCASE_UUIDV4",
  "repository": "brianbzeng/castingcompass",
  "environment": "production",
  "worker": "contourcast-halibut",
  "database": "contourcast-trips",
  "release_commit": "REPLACE_WITH_FULL_LOWERCASE_COMMIT",
  "gate_commit": "REPLACE_WITH_FULL_LOWERCASE_GATE_COMMIT",
  "action": "REPLACE_WITH_ONE_POLICY_ACTION",
  "issued_at": "REPLACE_WITH_UTC_TIMESTAMP_WITH_MILLISECONDS",
  "expires_at": "REPLACE_WITH_UTC_TIMESTAMP_NO_MORE_THAN_SIX_HOURS_LATER",
  "approvals": [
    {
      "role": "operator",
      "approved_at": "REPLACE_WITH_UTC_TIMESTAMP_WITH_MILLISECONDS",
      "evidence_sha256": "REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS"
    },
    {
      "role": "independent_reviewer",
      "approved_at": "REPLACE_WITH_UTC_TIMESTAMP_WITH_MILLISECONDS",
      "evidence_sha256": "REPLACE_WITH_A_DIFFERENT_64_CHARACTER_HASH"
    }
  ],
  "evidence": {
    "REPLACE_WITH_THE_ACTIONS_FIRST_SORTED_EVIDENCE_NAME": "REPLACE_WITH_ITS_UNIQUE_SHA256"
  }
}
```

The `evidence` object must contain exactly the sorted names for the selected action in the
policy, with a distinct digest for each evidence item. Approval digests must also be distinct.
The program verifies structure, ordering, hashes, time bounds, action, and source identity; it
cannot prove that two different humans actually approved the change or that the evidence is
truthful. The private review record must establish that separation.

## Safe use

From the reviewed full-release checkout, first validate without mutation:

```sh
export RELEASE_COMMIT=FULL_40_CHARACTER_REVIEWED_COMMIT
export RELEASE_AUTHORIZATION_FILE=/PRIVATE/ENCRYPTED/PATH/EXACT_ACTION.json
npm run verify:production-change -- --action deploy:maintenance
```

Deploy commands run the same verifier, confirm exact npm 10.9.8 and Wrangler 4.123.0, reinstall
the locked graph with lifecycle scripts disabled, rebuild the Cloudflare target, and invoke
Wrangler without a shell. The wrapper rechecks the installed tooling, clean source, packet,
action, and expiry after the build. It uploads exactly one inactive version, identifies that
version by comparing the before/after version inventories, and verifies its runtime, every
binding, every variable, the D1 identity, and all rate-limit parameters against reviewed source.
Only after a third authorization check does it re-read the active deployment, refuse any drift
from the recorded single version at `100%`, and then send `100%` of traffic to that exact new
version ID. It verifies the resulting deployment and automatically restores the recorded prior
version at `100%` if promotion or the final status check fails. D1 mutations likewise reauthorize after
their final read-only boundary check and immediately before the write:

```sh
npm run release:cloudflare:maintenance
npm run release:cloudflare
```

An abuse-control activation is a separate immutable normal-release commit whose checked-in
configuration sets both `RATE_LIMITING_ENABLED=true` and `TURNSTILE_ENABLED=true`. Provide only
the two activation values in an exact canonical JSON file outside every repository:

```sh
umask 077
export RELEASE_SECRETS_FILE=/PRIVATE/ENCRYPTED/PATH/activation-secrets.json
export RELEASE_AUTHORIZATION_FILE=/PRIVATE/ENCRYPTED/PATH/deploy-normal.json
npm run release:cloudflare:activation
```

Its private packet must name the distinct `deploy:activation` action. A prior `deploy:normal`
packet cannot authorize activation.

The file must be an absolute owner-readable regular file with one link, no symlink traversal,
no group/other permissions, exact ordered keys `RATE_LIMIT_KEY_SECRET` then
`TURNSTILE_SECRET_KEY`, distinct values of at least 32 characters, canonical two-space JSON,
and a trailing newline. The wrapper reads and fingerprints it privately before the build, repeats
the full file-identity and content check after the build, and passes it only to `wrangler versions
upload --secrets-file`. The fingerprint is an internal stability check and is not release output.
Never use `wrangler secret put` for this path because it creates and immediately deploys a
version rather than preserving the inactive inspection boundary.

The wrapper discards ambient `npm_config_*`, public-build, runtime-secret, `RELEASE_*`, and
`WRANGLER_*` overrides, uses empty npm user/global configuration, and restores only disabled
Wrangler metrics plus an optional evidence-output directory. Install and build subprocesses also
receive no `CLOUDFLARE_*` credentials; only the post-build Wrangler provider commands receive the
deployment authentication from the operator environment. If
`WRANGLER_OUTPUT_FILE_DIRECTORY` is set, it must already exist as
an owner-only, owner-owned, non-symlink directory outside both the release and gate checkouts.

The dedicated safety-floor commit does not contain the current gate. Invoke the current full-release
wrapper while pointing it at the separately checked-out safety worktree:

```sh
export RELEASE_ROOT=/ABSOLUTE/PATH/TO/SAFETY_WORKTREE
export RELEASE_COMMIT=511f85d7d5f8714d41633be24491e2087c366598
export RELEASE_GATE_COMMIT=FULL_40_CHARACTER_CURRENT_GATE_COMMIT
export RELEASE_AUTHORIZATION_FILE=/PRIVATE/ENCRYPTED/PATH/deploy-safety-floor.json
npm run release:cloudflare:safety-floor
```

For D1, set a new action-specific `RELEASE_AUTHORIZATION_FILE` before every reconciliation,
migration, or optimize command in [Integrated production release](INTEGRATED-RELEASE.md). Static
confirmation flags, a previous packet, or a successful preflight/postflight cannot authorize the
next mutation.

The public receipt contains only the authorization-file hash, action, release and gate commits,
expiry, role labels, and evidence names. Store it with the private release record, then continue
with the provider-state, exact-version, live-host, migration, alert, rollback, and smoke checks. A valid
packet followed by a failed or unverified provider operation is not release evidence.
