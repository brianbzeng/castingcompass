# Operating-cost and receipt ledger

The repository ships a blank, owner-ready workbook template at
[`finance/templates/CastingCompass-Operating-Cost-Ledger.xlsx`](../finance/templates/CastingCompass-Operating-Cost-Ledger.xlsx).
It records operating charges, credits, refunds, and receipt status by provider without mixing
financial records into application logs, analytics, or the future operator dashboard.

The committed workbook is a template only. It contains no actual cost, invoice, receipt,
account, payment, tax, or private storage data. Its machine-checked source boundary is
[`finance/provider-cost-ledger-template.json`](../finance/provider-cost-ledger-template.json),
where `financialDashboardAuthorized` and repository storage of actual ledger rows both remain
`false`.

## Start the private ledger

1. Copy the workbook into the private business-record folder outside this repository. Do not
   fill in the committed template.
2. Give the private copy an as-of date and keep access limited to the owner and a qualified
   professional when needed. Protect the folder with device encryption, MFA-backed storage, and
   a tested backup appropriate for financial records.
3. Enter one row per charge, credit, or refund. Use a controlled provider alias and category;
   keep the description short and non-sensitive.
4. Store each receipt, invoice, statement, contract, or tax document only in the private folder.
   Create an opaque reference such as `FIN-2026-0001` for the workbook. Never use an account,
   invoice, order, transaction, card, bank, tax, email, or storage-path value as that reference.
5. Reconcile the ledger monthly against the provider dashboard and private documents. `PASS` on
   the Checks sheet means only that the workbook's completeness checks pass; it is not an
   accounting, tax, legal, audit, or payment-provider conclusion.

Do not upload the completed workbook or source documents to GitHub, Codex, application storage,
PostHog, logs, analytics, issue comments, or a pull request. The repository ignores
`finance/private/`, `finance/receipts/`, and `finance/filled/` as an additional guard, but the
private copy should live outside the checkout entirely.

## Workbook map

- **Summary** shows formula-driven totals, unresolved receipt/review counts, version, and the
  explicit template or review status.
- **Ledger** reserves 200 rows with typed dates, USD values, controlled status fields, and a
  formula-derived net cost.
- **Providers** is a public-safe alias inventory. It does not assert that a provider is paid or
  that an account exists.
- **Receipt Register** links only opaque private receipt IDs to ledger entry IDs. It contains no
  document bytes, URLs, paths, or provider identifiers.
- **Checks** identifies missing dates, providers, statuses, receipt references, and unreconciled
  entries, and reconciles its total to Summary.
- **Instructions** preserves the privacy, monthly close, backup, and claim boundaries inside the
  workbook itself.

## Completion boundary

Creating and testing the blank workbook completes only the local ledger control. The roadmap item
stays open until the owner creates the private copy, enters every current provider cost or an
explicit zero-cost confirmation, associates privately stored receipts where applicable, and
completes a monthly reconciliation. No financial dashboard, billing integration, provider
mutation, production action, or tax/accounting conclusion is authorized by this template.
