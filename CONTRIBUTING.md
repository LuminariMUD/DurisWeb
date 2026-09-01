# Contributing

## Before You Start

Read [Onboarding](docs/onboarding.md), [Development](docs/development.md), and
the repository conventions in `.spec_system/CONVENTIONS.md`. Integration work
must also read `.spec_system/PRD/MUD_HANDOFF.md` and the cumulative security
record.

## Branches

The GitHub default branch is currently
`fix/local-web-session-revocation`. Create focused branches from the intended
base and use `type/short-description`, for example `feat/hook-metrics`,
`fix/session-expiry`, or `docs/onboarding`.

The DurisMUD server is a separate repository. A DurisWeb task does not authorize
editing, merging, or landing that repository unless the task explicitly says
so. Record its branch, commit, pushed state, and merged state independently.

## Commits

- Use a concise imperative subject, such as `Add hook state validation`.
- Keep one coherent change per commit.
- Do not include secrets, `.env` files, build output, backups, or player data.
- Preserve unrelated work already present in the checkout.

## Required Checks

Run the relevant commands from both packages when a change crosses the package
boundary. The full local matrix is documented in
[Development](docs/development.md).

At minimum, match the configured GitHub Actions quality gate:

```bash
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
```

Runtime changes should also run the applicable Jest/Vitest tests and production
builds. Do not silence a failing test or dependency audit to make a pull request
green; document confirmed exceptions in `.spec_system/audit/known-issues.md`.

## Pull Requests

1. Rebase or merge the current intended base into the branch according to the
   maintainer's direction.
2. Keep the diff focused and update documentation with behavior or configuration
   changes.
3. Explain what changed, why, tests run, operational impact, security/privacy
   impact, and any cross-repository dependency.
4. Open the pull request ready for review unless the work is intentionally
   incomplete.
5. Address confirmed review findings and keep the branch checks green.

No repository `CODEOWNERS`, required-review rule, or release approval policy is
currently committed. Maintainers must supply those organizational decisions.
