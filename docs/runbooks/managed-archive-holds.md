# Managed archive removal and holds

This is prepared source protection for website-managed ZIP archives referenced
by `mud_backups`. Manual deletion, failed-backup cleanup, and existing count
pruning use it. Any active validated hold conservatively preserves an archive:
the ZIP is indivisible and its subject/class contents are not inferred from
names. This approves no new period, retention execution, deployment or live
operation. Global `enforcementReady` remains false. Uploads, legacy SQL/staging
workspaces, other feature cleanup and restore replay remain separate work.
New creation streams directly into its managed ZIP, so it creates no extra raw
SQL/staging file to remove. Failed ZIPs retain the same protected identity.

## Admission and completion

The existing retention control row orders hold creation/release with removal
admission. Before disk work, a short transaction checks exact supported table
metadata, strict/FK/autocommit invariants, no triggers or incoming backup FK,
eligible completed/failed status, a unique canonical filename, and all validated
unreleased holds. Invalid/excessive protection refuses mutation rather than
trimming history. Review/expiry use database epochs. Any active scope blocks
archive removal; expired/released history remains retained.

The [DBA-installed metadata guard](lifecycle-metadata.md) establishes absence of
triggers and incoming references for all locked archive/hold/journal tables,
including links hidden from the website account in other schemas. Ordinary
catalog zero counts are insufficient. Missing or changed authority refuses
admission before a file worker can receive unlink permission.

Admission commits a private UUID receipt and active pointer under
`archive-removal-v1:` in `web_settings`. A credential-free one-shot Node worker
starts without a shell and reports its own boot/PID-namespace/process-start
identity. The parent arms that exact worker durably before sending unlink
authority. Unknown arming acknowledgement never authorizes unlink. A hold can
cancel prepared work atomically; an old parent cannot arm the cancelled intent.

Armed work blocks hold acknowledgement until the worker exits or its original
process is proven gone. An early success message is insufficient. The worker
checks the captured root/file identity, performs only the registered unlink,
and syncs the directory before confirming removal/absence. Standard streams
are ignored; the parent waits for process exit. Filesystem work and process
probes occur outside SQL transactions. The worker self-exits on its deadline
or IPC disconnect; the parent never sends a real signal to a stored PID.

Only confirmed removal/absence plus a successful metadata/checkpoint transaction
removes the matching backup row. Failure keeps its recovery identity, even when
the file may already be absent. Finished receipts remain. A failed partial ZIP
is retained for this same path instead of being unlinked in the writer's catch.
Earlier removals in a batch may already have completed; later failure stops it.

## Retry and restart

Retry an unconfirmed request after inspecting refreshed state. Hold retries use
the same caller UUID and exact original request. Existing pending removal is
reconciled before new work, then the transaction checks admission again to close
the recovery/admission gap. Recovery itself never unlinks a file or deletes a
backup row. It can abandon unauthorised prepared work or mark armed work failed
only after its original worker is fenced; a later explicit cleanup rechecks
current protection and absence.

Recovery compares boot/PID namespace and process-start ticks, using only a
zero-signal existence check. PID reuse is not ownership, and elapsed time is
not proof of death. Unknown boot/namespace, inaccessible identity, malformed
state or drift remains blocked for operator review. Do not rewrite worker
identity, clear the pointer, delete receipts or restore data merely to make
cleanup proceed. Cold-host or namespace-changing recovery needs independently
verified fencing and a reviewed compatible reconciliation; it is not automatic.

New hold writes return 409 while cleanup is in progress or recovery is
unverified, without claiming a hold was recorded. Retry after the stated
condition is resolved. Read/list operations remain observational. Existing
acknowledged holds prevent new archive admission. An already completed removal
cannot be recalled by a later hold.

## Platform and release prerequisites

The worker/fence requires Linux process identity and a reviewed local filesystem
(the source allowlist is ext-family, XFS and Btrfs; isolated qualification uses
ext4). Remote/unsupported filesystem semantics are refused. Directory/file
identity must remain stable; symlinks, shared legacy filenames and changed
artifacts are refused. This proves the owned archive path, not every physical
copy, recoverability of its contents or resistance to host-administrator action.

Before an authorized release, stop/drain every older website writer and reader.
Older cleanup can bypass admission and older generic settings readers do not
exclude this namespace. Include the compiled `archiveUnlinkWorker.js` and its
utilities; production execution needs no TypeScript loader. Rehearse on the
selected host/filesystem with protected current evidence. No migration or
immutable baseline change is introduced by this metadata journal.

Keep current hold/control/removal receipts independent of archived snapshots.
Application rollback must preserve compatible guards and private-prefix filters;
do not use a down chain or restore an old journal over current evidence.
Approved age/expiry, durable uploads/workspaces, protected offline restore replay
and complete P6/P7 acceptance remain open. See the
[cleanup recovery guide](backup-archive-cleanup.md) and
[operator restore boundary](../deployment.md#application-restore-boundary).

## Private evidence and diagnostics

The singleton is an O(1) active index; UUID-keyed receipts retain kind, backup
ID, filename, physical identity hashes, database epochs, phase/outcome and worker
identity. These are indirectly linkable operator records, excluded from generic
settings including SQL-collation aliases. No archive contents, account/IP list,
application credentials or raw driver output are stored in the journal or
ordinary diagnostics. Its own retention period is unapproved: retain/restrict
history rather than automatically deleting completed or invalid evidence.

409 denotes a held, active, shared, unsafe or review-blocked operation; 503
denotes unconfirmed file/storage work. Responses and server diagnostics use safe
categories and references. Once admitted, the reference identifies the UUID
receipt; an earlier refusal can have only a diagnostic attempt reference. The
page explains holds/busy/review states without exposing private server detail or
claiming success. Keep the reference for authorized private investigation.

Protocol references: Node's [process-exit and IPC lifecycle](https://raw.githubusercontent.com/nodejs/node/v24.x/doc/api/child_process.md),
Linux [zero-signal existence checks](https://man7.org/linux/man-pages/man2/kill.2.html),
[process start ticks](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)
and [PID namespaces](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html).
