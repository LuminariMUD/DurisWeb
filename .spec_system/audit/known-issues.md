# Known Issues

Intentional exceptions to automated checks. Every entry records why it is
exempt and when it was added. Remove entries that no longer apply.

## Ignored Paths

| Pattern | Reason | Added |
|---------|--------|-------|
| `backend/migrations/*.sql` | Immutable pre-Knex bootstrap artifacts with no `down` implementation. Loading or rewriting them would destructively replay already-applied DDL/DML in shared environments. | 2026-09-01 |

## Ignored Rules

| Tool | Rule | Scope | Reason | Added |
|------|------|-------|--------|-------|

## Known Failing Tests

| Test | Reason | Added |
|------|--------|-------|

## Skipped Workflows

| Workflow | Reason | Added |
|----------|--------|-------|

## Skipped Infra

| Item | Reason | Added |
|------|--------|-------|
| Existing development-database Knex ledger reconciliation | The local database was populated out of band and reports 47 TypeScript migrations as pending even though portions of their schema exist. Automatically rewriting ledger rows could falsely certify shared schema state, so migration reversibility was verified on a disposable schema clone with an explicit baseline instead. | 2026-09-01 |
