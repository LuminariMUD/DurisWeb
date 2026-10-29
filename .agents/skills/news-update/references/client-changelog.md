# Mudlet client history

The public `/news?tab=client` tab reads
`frontend/src/content/clientChangelog.json`. This is reviewed website content
copied from `LuminariMUD/duris-client/CHANGELOG.md`, with its full source commit
and published release links. It is bundled with the frontend, so visitors do not
need GitHub access and GitHub outages or API limits do not break the tab.

From the DurisWeb root, with Python 3 and authenticated GitHub CLI available:

```sh
python3 .agents/skills/news-update/scripts/sync_client_changelog.py
git diff -- frontend/src/content/clientChangelog.json
```

The script discovers the upstream default branch, pins its full SHA, reads that
exact changelog, and paginates all GitHub releases. It replaces the snapshot only
after fetching and parsing the complete history. It preserves source order,
paragraphs, bullets, inline code, emphasis, links and recorded dates, including
the original undated 1.0 notes. Only public stable releases get release links;
other historical entries link to the pinned source. Source text is escaped and
the frontend also applies the existing changelog sanitizer.

Review the old `sourceSha` through the new one using GitHub comparison/PR tools
or a read-only client checkout. Reconcile every new client effect with its
changelog section or a concrete no-news reason. The importer copies maintained
notes; it cannot prove that upstream omitted no changes. Do not modify the client
repository, invent missing release dates, or describe an untagged section as a
downloadable release. If upstream formatting changes or notes are incomplete,
resolve the evidence and adapt the importer before replacing good content.

Run the importer again to check idempotence. Test the parser with:

```sh
python3 -m unittest discover -s .agents/skills/news-update/scripts -p 'test_*.py' -v
pnpm --dir frontend test:unit --run src/views/__tests__/NewsView.spec.ts
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend build
```

Follow the normal isolated build/deployment procedure. After authorized website
deployment, open `/news?tab=client` anonymously on the public origin, verify the
latest and oldest notes, expand an older version, and follow the release/source
links. Confirm MUD News and Website Changelog still work and the selected tab
survives refresh. Website news may announce the new tab once it is live; client
history itself never goes through `/api/changelog` and sends no notifications.
