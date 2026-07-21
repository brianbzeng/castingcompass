# Key-custody independent-review handoff

This runbook prepares and evaluates private evidence for the production key-custody gate. It
does not query Cloudflare or any credential provider, inspect a secret value, approve key
custody, authorize a restore, authorize deployment, or authorize production. A repository test
or a syntactically valid review record is not provider evidence.

The locked policy covers the seven Worker runtime-secret roles and four backup-key roles in
[Key custody and encryption](KEY-CUSTODY-AND-ENCRYPTION.md). The private evidence manifest
references six distinct evidence artifacts only by SHA-256:

1. the runtime secret inventory;
2. the backup custody inventory;
3. the account access and MFA review;
4. the rotation/recovery exercise record;
5. the production-shaped restore/deletion-replay record; and
6. the alert/log redaction test.

Those private artifacts may identify roles, environment, provider, opaque or hashed key-version
identifiers, timestamps, retention classes, and outcomes. They must never contain a secret value,
recovery code, session token, deploy credential, raw key, or reusable authentication material.
The repository receives only aggregate schema/policy files and minimized receipts.

## Private filesystem boundary

Create a current-user-owned `0700` directory on an encrypted, access-restricted volume outside
every repository checkout. Every evidence and review file must be an exact `0600` regular file
with one hard link. The readers open without following links, bound every read to 64 KiB, and
recheck device, inode, mode, owner, link count, size, modification time, and canonical path after
reading. The writers create one new file exclusively, synchronize it, and never overwrite.

Do not paste any private file, digest-bearing review record, provider screenshot, identity, note,
or path into Git, an issue, a pull request, chat, logs, analytics, or a public release receipt.

## Operator procedure

1. Select the exact reviewed 40-character source commit. The evidence and review must bind to
   that same independently supplied commit.
2. Create the unfilled evidence manifest. The writer fixes the schema, production environment,
   exact seven runtime-secret names, exact four backup-key roles, source commit, and false
   secret-capture assertion.

   ```sh
   mkdir -p /PRIVATE/ENCRYPTED/PATH/key-custody
   chmod 700 /PRIVATE/ENCRYPTED/PATH/key-custody
   npm run write:key-custody-evidence-template -- \
     --output-file /PRIVATE/ENCRYPTED/PATH/key-custody/evidence.json \
     --expected-source-commit FULL_40_CHARACTER_SOURCE_COMMIT
   ```

3. Record an exact UTC `captured_at` timestamp with milliseconds and the six distinct lowercase
   SHA-256 evidence digests. Do not change the writer-controlled arrays, environment, schema,
   source commit, or `secret_values_captured: false`. The evidence must be no older than 30 days
   when evaluated.
4. Run the guarded review-template writer. It validates the complete canonical evidence manifest
   and its independently supplied commit before binding the exact manifest hash into a new
   unfilled review record.

   ```sh
   npm run write:key-custody-review-template -- \
     --evidence-file /PRIVATE/ENCRYPTED/PATH/key-custody/evidence.json \
     --output-file /PRIVATE/ENCRYPTED/PATH/key-custody/independent-review.json \
     --expected-source-commit FULL_40_CHARACTER_SOURCE_COMMIT
   ```

5. Give the evidence artifacts and unfilled review to a qualified reviewer who was not the
   operator or implementer. The reviewer records a lowercase UUIDv4, exact UTC review time,
   distinct competence and review-note evidence digests, and an honest disposition. They may set
   `accepted_evidence_boundary` only with zero blocking findings, all 15 checks true, a review no
   earlier than evidence capture, and no secret material in the record. Otherwise retain
   `changes_required` with a failed check or blocking finding.
6. Evaluate the exact private files:

   ```sh
   KEY_CUSTODY_EVIDENCE_FILE=/PRIVATE/ENCRYPTED/PATH/key-custody/evidence.json \
   KEY_CUSTODY_REVIEW_FILE=/PRIVATE/ENCRYPTED/PATH/key-custody/independent-review.json \
   KEY_CUSTODY_EXPECTED_SOURCE_COMMIT=FULL_40_CHARACTER_SOURCE_COMMIT \
   npm run verify:key-custody-review
   ```

The receipt reports only scope, source commit, disposition, aggregate role/check counts, and the
remaining gates. It omits private paths, review identity, competence evidence, custody evidence,
review notes, and all evidence hashes.

## Authority boundary

An accepted record means only that the supplied evidence boundary passed this independent-review
contract. The receipt always leaves these false:

- `production_key_custody_approved`;
- `production_restore_gate_passed`; and
- `production_release_authorized`.

Current provider identity/binding evidence, a separate action-specific production-change
authorization, the current production restore/deletion-ledger evidence, deployment, and live
smoke evidence remain required. Never treat this handoff as a substitute for those gates.

Machine contracts:

- [`security/key-custody-review-policy.json`](../security/key-custody-review-policy.json)
- [`contracts/key-custody-evidence-manifest.schema.json`](../contracts/key-custody-evidence-manifest.schema.json)
- [`contracts/key-custody-independent-review.schema.json`](../contracts/key-custody-independent-review.schema.json)
