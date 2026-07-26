# Isolated staging configuration

Status: repository verifier complete; no provider resource was provisioned and no Worker was
deployed

This gate proves that the two resolved Wrangler configuration manifests needed by the authenticated
advisory-review drill are structurally isolated from CastingCompass production. It performs only
local file, schema, policy, and source-checkout verification. It has no deploy command and does
not contact Cloudflare.

These private files are strict review manifests, not files to pass directly to Wrangler. Their
`schema_version` field is repository control metadata, and relative source paths are reviewed
identities rather than deployment-path instructions. A later separately authorized provider
procedure must render the actual deployment configuration, prove it matches every manifest field,
and bind the resulting configuration hash to the recorded Worker version. This repository gate
does not claim that application step has happened.

## Why there are two configurations

`AI_REVIEW_QUEUE_ENABLED` is a Worker deployment variable. Direct review requires it to be
`false`; durable Queue review requires it to be `true` and requires producer, consumer, and
dead-letter Queue bindings. One deployed Worker version cannot truthfully represent both modes.

The drill therefore requires two distinct application Worker version IDs created from two
resolved configurations that share the same isolated host, D1 database, rate-limit namespaces,
exercise service binding, synthetic-account boundary, and stub version. The only intentional
differences are the Queue flag and Queue bindings.

## Locked exclusions

Both private configurations must:

- use the fixed `contourcast-halibut-isolated-staging` Worker name with `workers.dev` disabled and
  exactly one non-production custom domain;
- reject every production host, every `*.castingcompass.com` host, the production Worker name,
  production D1 name/ID, and all six production rate-limit namespaces;
- use exactly one separately named `*-isolated-staging` D1 database and six distinct non-production
  rate-limit namespaces, with rate limiting enabled;
- bind only the private deterministic `contourcast-ai-review-stub-isolated` service under
  `AI_REVIEW_EXERCISE_PROVIDER`;
- use one exact exercise ID, pre-hashed synthetic-account subject, and stub Worker version;
- keep discussions, photos, Turnstile, privacy-export Queue processing, and maintenance mode off;
  and
- contain no MiMo, Resend, Turnstile-secret, R2, KV, Durable Object, public AI, outbound callback,
  cron, or other undeclared binding.

The strict schema's `additionalProperties: false` boundary makes an undeclared variable or
provider binding a refusal rather than an ignored warning. The Queue configuration additionally
locks batch size 5, timeout 10 seconds, eight delivery retries, concurrency 1, and the separate
dead-letter Queue.

## Private preparation

Verify the committed policy in CI or locally:

```sh
npm run security:isolated-staging-config-policy
```

Create deliberately non-deployable manifest templates in an owner-only directory outside the repository:

```sh
npm run isolated-staging-config:write-template -- \
  --mode direct \
  --output /absolute/private/path/direct-config-manifest.json

npm run isolated-staging-config:write-template -- \
  --mode durable_queue \
  --output /absolute/private/path/queue-config-manifest.json
```

The writer uses exclusive `0600` files and placeholder resource identities that fail validation.
After separately authorized isolated resources exist, replace the placeholders from provider
evidence. Do not put credentials, cookies, account IDs, email addresses, raw trip IDs, or user data
in either configuration.

From an exact clean reviewed commit already reachable from official `origin/main`, generate the
minimized private receipt:

```sh
npm run isolated-staging-config:verify -- \
  --direct-config /absolute/private/path/direct-config-manifest.json \
  --queue-config /absolute/private/path/queue-config-manifest.json \
  --expected-commit FULL_40_CHARACTER_COMMIT \
  --output /absolute/private/path/isolated-staging-config-receipt.json
```

The command prints the canonical receipt SHA-256 but no resource IDs. The receipt contains only
the source commit, target origin, synthetic account hash, stub version, configuration/resource
hashes, mode boundaries, and explicit false provider/deployment/production claims. It is not
evidence that the resources exist or that either version was deployed.

## Handoff to the authenticated drill

Only after the two manifests are independently reviewed, rendered exactly, and separately deployed should the
authenticated authorization name the exact, distinct direct and durable-Queue Worker version IDs.
It must also copy the canonical configuration-receipt SHA-256. Planning then requires the private
receipt file and verifies source, target, exercise, account, stub version, and receipt hash before
writing a non-executing plan. The plan maps each version ID to its exact manifest SHA-256 so a
version cannot silently stand in for the other mode.

This configuration gate does not authorize load, penetration testing, provider changes, or
production promotion. Those remain separate written approvals and evidence gates.
