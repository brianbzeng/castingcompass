# Cloudflare provider-state audit

This audit prevents a disconnected dashboard integration or an operator expectation from being
treated as proof that the Worker is paused. It compares the active Worker version with the
checked-in `wrangler.jsonc` contract using two read-only Wrangler queries. It never deploys,
changes traffic, reads secret values, mutates D1, changes routes, or writes provider evidence.

The locked contract is
[`security/cloudflare-provider-state-policy.json`](../security/cloudflare-provider-state-policy.json).
CI runs only its offline verifier:

```sh
npm run security:cloudflare-provider-state
```

The live query is an explicit operator action:

```sh
npm run audit:cloudflare:state -- --confirm-read-only contourcast-halibut
```

The runner invokes only these shapes through `spawnSync` with `shell: false`:

```text
wrangler deployments status --name contourcast-halibut --config wrangler.jsonc --json
wrangler versions view ACTIVE_VERSION --name contourcast-halibut --config wrangler.jsonc --json
```

The active version identifier is accepted only from bounded deployment JSON and must match the
strict Worker-version format before it becomes one argument to the second command. Split traffic,
malformed or oversized JSON, ambiguous identities, duplicate bindings, and command failure all
fail closed.

## What the public receipt can prove

The receipt contains only the observation time, Worker name, aggregate traffic/maintenance/config
booleans, checked-in binding names that are missing or mismatched, an unexpected non-secret
binding count, and blocker codes. It omits deployment and version identifiers, account and author
identifiers, emails, D1 and rate-limit namespace identifiers, etags, secret binding names, tokens,
and command stderr.

Configuration parity means the active version matches the checked-in compatibility date and
flags, plain variables, assets binding, version-metadata binding, D1 binding identity, and all six
rate-limit bindings. The hold comparison deliberately expects deployed
`RELEASE_MAINTENANCE_MODE=true` while the safe checked-in candidate default remains `false`.
Unlisted `secret_text` bindings are ignored for parity and never enter the receipt.

Even a matching maintenance candidate cannot make `production_hold_proven` or `release_ready`
true. A separate live-host maintenance verifier must prove the canonical and direct Worker hosts,
and private release evidence must bind the exact reviewed commit to the exact deployment and
version. Provider metadata is useful context but is not sufficient source provenance.

## 2026-07-19 reconciliation

A read-only reconciliation found one active version receiving all traffic, five attached domains,
one cron trigger, maintenance mode off, and recent invocations. The active version predates two
checked-in variables and all six checked-in rate-limit bindings. The dashboard's Git build
integration was disconnected, but the Worker service and routes were still active. No Cloudflare,
DNS, D1, secret, route, traffic, or deployment mutation was performed.

This is a release blocker, not authorization to repair production. The integrated release order,
migrations, maintenance bridge, private identity evidence, and live verification in
[`INTEGRATED-RELEASE.md`](INTEGRATED-RELEASE.md) remain mandatory.
