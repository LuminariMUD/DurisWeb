# Backup archive cleanup and recovery

These are prepared source safeguards for the existing manual/hourly count
limits and explicit administrative cleanup. They approve no new age period or
actual archive operation. The prepared [managed ZIP admission protocol](managed-archive-holds.md)
now enforces validated holds and retains durable removal receipts. New uploads use
the registered lifecycle below. Legacy temporary uploads/dump/staging workspaces,
independently protected evidence and offline replay
remain required P6 work. The hold API still reports global
`enforcementReady: false`; no complete copy/restore protection is claimed.

Before stopping or restarting an old website service, complete the
[legacy temporary-copy preservation gate](../deployment.md#legacy-temporary-copy-preservation-gate).
Its `PrivateTmp` files can disappear on service stop, including a dependency or
watchdog restart. Inventory/preserve the actual old namespace first; a scan of
the host's ordinary temporary directory or the new persistent upload records
does not cover those legacy copies. No live namespace or file is changed here.

## New archive creation

New backups stream `mysqldump` output directly into the exclusive private managed
ZIP. Its sole entry is `database/database.sql`; inspection already accepts this
layout. The first pass always excludes all `web_sessions` rows, and a second
schema-only pass adds that table when present. No raw SQL or staging-directory
disk copy is created, copied, unlinked or recursively removed. Existing legacy
files are preserved for separately verified discovery/adoption and fenced cleanup.

The ZIP is opened without overwrite, mode 0600. Completion waits for dump exit,
stream/ZIP footer completion, file flush/close and directory sync before the
backup row becomes completed. Failure stops/reaps the fresh owned dump process,
closes output and retains any partial ZIP and row for managed removal. A timeout
or unknown status alone never makes an older producer eligible for deletion.
Dump credentials stay in the child environment, not shell/password arguments;
no shell or system ZIP command is used. Progress describes streaming/finalizing.
Errors use static categories and a UUID reference, not SQL bindings, stderr,
filesystem paths, IP values or credentials. Investigate the reference against
the backup ID and last known state before retrying. Count pruning remains a
separate hold-aware operation after a new archive completes.

## Private legacy-copy inventory

The source includes a read-only discovery command for the layouts traced from
the older uploader/producer. Run it only in the explicitly selected authorized
environment and namespace, before the preservation gate's service teardown:

```bash
pnpm --dir backend --silent backup:inventory \
  --backup-root /absolute/configured/backup-root \
  --legacy-upload-root /absolute/actual/old/upload-root \
  --private-out /absolute/owner-only-persistent-directory/new-inventory.json
```

Roots and the output parent must be canonical paths in the selected current
mount namespace; symlink aliases and `/proc/<pid>/root` or descriptor aliases
are refused. Resolving such an alias to an ordinary host path must not silently
change the namespace being inventoried. The configured `BACKUP_DIR` itself must be canonical, and the selected backup
root must match it. There is no default
upload root; omission records `legacyUploadScope: not_selected`. The command
does not attach to another namespace or discover its location automatically.
An empty host `/tmp` scan cannot establish that an old `PrivateTmp` namespace
has no uploads. Use the compiled `backend/dist/scripts/legacyBackupInventory.js`
entry point for an already built release. No SQL/Redis/provider connection or
MUD operation is made.

The private output identifies only `temp_<id>.sql`, the exact
`temp_staging_<id>/database/<name>.sql` tree and
`backup-upload-<timestamp>-<random><original-extension>` in their selected roots.
The original upload suffix can be uppercase, non-ZIP or absent; its encoded
filename is bounded by the filesystem component limit. A single staging SQL
member can use spaces, dots, `@` and Unicode from the configured database name.
Numeric IDs are
filename hints, not established backup ownership. Physical hashes cover stat
identity/size/timestamps, not file contents. Directory descriptors anchor the
walk; symlinks, hardlinked/special files, cross-device members, nested mounts
and unexpected staging layouts are retained as unsafe/unconfirmed observations.
Opened entries must match the selected root's mount ID from
[Linux descriptor metadata](https://man7.org/linux/man-pages/man5/proc_pid_fdinfo.5.html),
including bind mounts on the same device. File descriptors are used only for
metadata; no source copy content is read, extracted, copied, changed or deleted.
Unrecognized names within a legacy prefix are counted without exposing those
names in the report. The package script silences dotenv's startup notice;
`--silent` also suppresses pnpm's command banner when capturing aggregate JSON.

Generator-shaped regular uploads remain untrusted byte copies, not validated ZIPs.

Limits are 10,000 root entries and 1,000 recognized copies per root, a shared
five-second cooperative budget checked through root and per-copy metadata
traversal, and a 1 MiB output cap. Exactly 1,000 copies can complete, including
trailing non-copy entries; a further recognized copy makes the scan incomplete.
These are discovery limits, not a hard timeout on a stalled kernel I/O call.
Selected roots can be tmpfs or other mounted storage; nested mount crossings
within those roots are refused. These read-only observations confer
none of the managed unlink worker's local-filesystem or exit-fence guarantees.
Bounds, unreadable state or detected directory changes prevent a complete
observation. There is no invented continuation through an unstable directory;
an incomplete report requires separately reviewed discovery of the omitted
scope and cannot authorize an adoption or release. `scanComplete` means the
selected enumeration reached its end within bounds, not a consistent snapshot:
concurrent changes and filesystem timestamp granularity can hide a change.
Every report explicitly sets `snapshotConsistent: false`,
`writerFenceVerified: false` and `deletionAdmission: unavailable`.

Only the new private evidence file is written. Its existing parent must be
owner-only and outside all selected roots. Descriptor mount IDs and filesystem
roots reject bind aliases into a selected root or descendant before writing,
and separation is rechecked before acknowledgement. The file is exclusive,
explicitly set to mode 0600 independently of umask, owner-checked and flushed
with its directory. Its descriptor remains open through directory sync; final
checks compare the named file with the written inode/metadata and independently
read back the bounded JSON against the serialized evidence. Missing, renamed,
replaced or modified evidence is not acknowledged as saved. This reads the
command's own output, never source copy contents. Existing files/links are never
overwritten. Failed or unknown write/sync may leave partial evidence; retain and
review it rather than deleting or accepting it. Ordinary output has only UUID,
scope flags, aggregate counts and safe categories, without paths, copy names or
payloads. Exit 0 means the selected scan/output completed, 2 means partial or
unsafe/unknown observations, and 1 means failure. Exit 0 never proves global
namespace coverage, writer closure, ownership, preservation or cleanup safety.
The operator must separately verify destination persistence and independent
protection; the path and a successful flush do not certify either.

Keep the selected command/build/root/namespace provenance and private report in
protected operator evidence, with its own unapproved retention/subject-review
rules. This inventory supplies discovery input only. Verified writer fencing,
protected-byte preservation, ownership/adoption, holds and compatible offline
restore replay remain separate P6 requirements before any removal or rollout.

## Protected individual byte copies

`backup:preserve-legacy` prepares an individual private byte copy for later
review. Use it only with authorization for the selected environment. It leaves
the source in place and does not control services, adopt records or authorize
cleanup. The whole-cohort/namespace preservation gate above still applies.

```bash
pnpm --dir backend --silent backup:preserve-legacy copy \
  --backup-root /absolute/canonical/configured/backup-root \
  --source-name temp_123.sql \
  --source-physical-sha256 REVIEWED_INVENTORY_FILE_HASH \
  --protected-root /absolute/persistent/owner-only-directory \
  --operation-id UUID_V4_FOR_THIS_COPY \
  --python-bin /absolute/python3 \
  --max-bytes 536870912
```

For staging, select `temp_staging_<id>/database/<name>.sql` and its inventory
`sqlMember.physicalSha256`, not the staging directory hash. For an old upload,
also supply its explicitly selected `--legacy-upload-root` and use its generated
relative filename, including the original suffix. Source root and components
are descriptor-anchored, canonical and link-safe; supplied physical identity
must still match. Numeric names do not establish a website account owner.

Copying requires Linux, a reviewed Python 3 executable (qualified here with
Python 3.12; use 3.9 or newer) and the shipped
`backend/scripts/legacyFileLeaseWorker.py`. Node does not expose the required
lease syscall; the one-shot stdlib worker receives only source/destination
descriptors and bounded arguments, no application environment or credentials.
The source owner or appropriate OS lease capability must permit the operation.
An existing writer, writable mapping, unavailable lease or competing write-open
prevents success. The helper checks lease/interruption state during copy and
independent destination-hash verification. See the Linux
[file-lease reference](https://man7.org/linux/man-pages/man2/F_SETLEASE.2const.html).

The protected root must be canonical, owner-only, outside the selected source
roots and volatile system paths, on the reviewed local filesystem types used
by managed storage. Tests qualify ext4 destinations and ext4/tmpfs sources.
Descriptor mount IDs and [mountinfo filesystem roots](https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html)
reject bind aliases that place the destination inside a declared source root,
or make it an ancestor of the selected source. The check is repeated before
acknowledgement and includes aliases across nested mounts. Different canonical
path strings alone do not establish separation.
XFS/Btrfs are allowlisted but not qualified here. Path/type checks and fsync
cannot certify independent storage, encryption or recovery; verify those with
the operator's actual protected-storage design. Treat older bytes as sensitive,
including possible session credentials. They remain private OS files, outside
website history/download and count pruning, without sanitization or restore.

Each explicit UUID creates `legacy-preserve-<UUID>/` exclusively, mode 0700.
`prepared.json` is private and flushed before any bytes are copied into the
exclusive 0600 `payload.bin`. The bounded helper copies with a kernel read
lease, hashes and flushes output, then independently reads it back. Matching
source/file identities, size, bytes and hashes permit immutable `complete.json`
and directory sync. Source paths and payloads stay out of ordinary output.
Before acknowledgement, the named bundle and `payload.bin` must still match
the opened descriptors and expected payload identity; rename, replacement or
observed late byte changes retain the operation for review instead of success.
After the copy worker exits, the parent closes its writable payload descriptor
and obtains a read-only descriptor for the same file object. A bounded lease-only
mode of the existing Python helper excludes payload writers while the parent
rehashes bytes, writes/syncs receipts, and performs the final named-bundle checks.
The helper confirms the lease and unchanged payload identity after those checks;
interruption, a competing writer, timeout or an unconfirmed helper exit refuses
acknowledgement. The helper is reaped before the operation finishes.
The parent independently rehashes payload bytes after the copy worker exits and
binds that read to unchanged metadata. Final acknowledgement requires exactly
`prepared.json`, `complete.json` and `payload.bin`, revalidates both receipt
contents/identities, and keeps every opened/named entry on the qualified protected
mount. An unqualified bundle is refused before writing receipts or copy bytes.
Byte/time limits refuse work; they never truncate a source. The default worker
budget is 30 seconds, selectable from 1 to 300,000 milliseconds, with a fresh
owned-child kill request one second later. Stalled kernel I/O can still delay
exit; the parent waits for actual worker termination before finalizing.
The parent hashing pass uses the selected time budget too; it is a separate
bounded pass, not a hard end-to-end deadline over all filesystem calls.

Errors retain prepared/failed receipts and any partial payload. No source,
partial copy or receipt is deleted, repaired or overwritten.
If the worker verified bytes before a later failure, its bounded hash/size
evidence is retained in the failed receipt for review, without completing the
operation. Close-acknowledgement errors still close every other descriptor and
retain the same reference; an earlier error does not skip later closes.
Same-ID copy retries refuse an existing bundle; inspect it with the separate
recovery mode:

```bash
pnpm --dir backend --silent backup:preserve-legacy verify \
  --protected-root /absolute/same/protected-directory \
  --operation-id SAME_UUID_V4 \
  --python-bin /absolute/python3
```

Recovery verifies strict private receipt shapes, physical identity and actual
payload hash under the same payload lease, then syncs and confirms the named
bundle before acknowledging. It requires the explicit reviewed Python interpreter
and shipped helper, but no source, application environment or SQL. It cannot
promote incomplete/failed work to completed. The compiled entry is
`backend/dist/scripts/legacyCopyPreservation.js`; retain its required application
dependencies and the reviewed software with protected operational evidence.
Unknown receipt/sync state remains review-required. No new UUID should be used
to hide an uncertain previous operation.
Verification also rechecks the named bundle/payload before returning. The package
script suppresses dotenv startup output; `--silent` suppresses pnpm's banner.

Read leases guard the source during copying and the payload during final
verification/confirmation; this is
not a whole-service fence and does not prevent rename/unlink or namespace
teardown. Rechecks refuse observed identity/path changes, while unexpected
external cleanup can still remove an original. A verified byte copy does not
establish a consistent database backup, provenance/ownership approval or
recoverability of the whole declared scope. Every result keeps cohort fencing
unverified and adoption/deletion admission unavailable. Preserve all private
bundle states under their own unapproved lifecycle; complete independent
evidence, hold-compatible adoption and offline restore replay before release.

## Generated archive inspection

Generated backups use the same validated, inherited descriptor as uploaded
archives. Their inspector streams the SQL member, discarding unrelated
mysqldump data lines as chunks arrive. It retains only the account-character
definition/data and player-data definition needed for the existing summary.
A large unrelated INSERT therefore does not consume a whole-line buffer or
trigger the uploaded SQL member's 64 MiB ceiling. The generated mysqldump format
escapes newlines inside data values; table definitions may span physical lines.

Selected summary SQL remains bounded at 64 MiB; the existing 5,000-item and
256 KiB result limits and 192 MiB heap limit still apply. Generated inspection
has a 120-second child deadline and a 121-second parent deadline. A timeout,
changed archive identity or excessive summary remains unconfirmed, with the
archive retained. Inspection executes no SQL and does not authorize restore.
Uploaded archives keep their separate total SQL-size and shorter time limits.

## Deletion acknowledgement

Manual removal, failed-backup cleanup and automatic count pruning share the
same file/record deletion function. It accepts only completed/failed records,
one database reference to the filename, and the existing canonical regular-file
path contract. Pending/in-progress, shared legacy filenames, unsafe paths and
symlinks are refused before unlink. New archives append a fresh UUID to their
timestamp so simultaneous backups do not share a name. Existing names remain
readable; shared legacy files need private investigation rather than deletion.

The existing record is the retry identity. Only acknowledged unlink or a
confirmed `ENOENT` permits record deletion, bound to the same ID/filename and
eligible status. Access/I/O/unknown errors retain the record and stop cleanup.
SQL failure after unlink reports uncertainty; the file can already be absent.
Retry rechecks that absence, while an already committed record deletion can
appear as not found. Do not recreate a file merely to retry metadata cleanup.
This confirms the owned archive path, not other copies or complete erasure.

A failed-backup batch stops at its first unconfirmed removal. Earlier entries
can already be gone; refresh the list and retry retained work after diagnosis.
There is no all-or-nothing filesystem rollback. The HTTP response gives a safe
category/reference instead of raw driver text or a false success/count. Invalid,
active, shared, held or review-blocked targets return 409; unconfirmed
file/storage work returns 503.
The page awaits the actual deletion request and refreshes after either outcome.

Backup creation also waits for an acknowledged positive operation ID; an
unconfirmed start refreshes the list before another attempt. Stored/uploaded
restore requests retain their dialog, selections and upload reference when
refused, with a persistent inline error. Pending operations block duplicate
submission and cancellation. Cancelling an upload waits for success; refusal
keeps the file reference and permits retry. A declared gated-operation response
does not imply the whole website is offline. These are client acknowledgement
safeguards. Durable upload recovery and managed physical removal require the
separate server protocol below.

## Registered uploads

Before receiving file bytes, the website commits a `mud_backups` row and a private
`backup-upload-v1:` settings receipt containing the authenticated owner, opaque
UUID, physical root identity and Linux writer identity. Files use the persistent
configured `BACKUP_DIR`, exclusive creation and mode 0600. The API's compatibility
field `tempPath` now contains the opaque UUID; client filesystem paths are refused.
No OS-temporary-file fallback or implicit Multer unlink remains. Uploaded filenames
are marked `duris-mud-upload-<UUID>.zip` and excluded from manual/hourly count
pruning and **Clear Failed** bulk cleanup. Retained uploads require explicit
cancellation; the bulk button counts only generated failed backups. No automatic
upload expiry period has been approved or implemented.

File close/flush and directory sync precede the inspection checkpoint. A separate
read-only process receives no application environment or SQL credentials, executes
no SQL and extracts no files. Uploaded-archive inspection allows one SQL member, at most 10,000 ZIP
entries, 64 MiB decompressed SQL and 5,000 account/character summary items each,
with a 256 KiB summary and 192 MiB V8 heap limit. Its own 15-second deadline and
the parent's 16-second deadline bound work. This checks a supported format and
summary; it does not approve or certify a restore. Budget exhaustion, malformed
ZIP/parser failure and uncertain storage are retained for review, not discarded
as confirmed invalid. Physical identity is rechecked before acknowledgement.

Known format/size rejection requests the existing managed remover after the writer
is closed. Every active hold scope preserves the entire archive. Cancellation,
including retries, requires a matching completed removal receipt before success;
any present file must match the registered identity both at cancellation's first
check and when the managed remover admits the target. A replaced file is kept
for review, including replacement during the intervening asynchronous work. The
generic delete-by-backup-ID path refuses upload-marked files so it cannot bypass
these registered cancellation checks;
an absent row/file alone is insufficient. Retain the upload and removal receipts
until their own approved lifecycle exists. Generic settings APIs hide both private
namespaces, including SQL collation aliases.

Refresh the backup page after a lost response. Uploaded rows remain visible to
their uploader or an overlord. **Recover interrupted upload for review** can close
an inspection checkpoint immediately because writing already stopped. A receiving
checkpoint requires proof that the original process is gone; elapsed time alone
does not suffice. Unknown registration commit acknowledgements can leave a receiving
row with no file until that proof is available. A different boot/PID namespace or
changed file/root needs private operator investigation. Recovery never deletes or
executes archive contents and a late inspector cannot overwrite its result.

The browser scopes its backup-list cache to the signed-in account and current
role, cancelling pending list requests when either changes. Signing out, changing
accounts or returning with lower privileges does not reuse an earlier privileged
list. Numeric status/download/contents requests for another owner's upload return
the same plain 404 as a missing backup, without the stored upload reference.

Closed retained uploads offer download and cancellation from the list after a
page reload. Both require owner/overlord access; pending writers cannot be
downloaded or removed. Holds or uncertainty return a failed operation with a safe
reference and retain work. Existing legacy OS-temporary uploads are not adopted,
unlinked or falsely acknowledged by these endpoints. Website restore remains
unavailable. Protect independent current evidence before any authorized offline
restore; these upload safeguards do not establish all-copy enforcement.

Download opens without following a replacement link, validates the opened file
against the registered identity, and streams that descriptor with its actual
size. Completion, error and client disconnect close the reader. A failure before
attachment bytes are sent returns a safe JSON error/reference instead of an
error body labelled as a ZIP. Archive inspection likewise inherits the validated
descriptor in its bounded child; neither reader reopens the archive pathname.
The child owns its descriptor across ZIP range streams and checks its identity
before/after parsing. Registered identities are passed through initial upload
inspection and later contents requests. Receiving/review-required upload rows
remain visible but do not count as generated backups in the Create Backup guard.

## Preserve evidence

Listing no longer deletes records because their files appear absent, or changes
a pending/in-progress backup to failed merely because 30 minutes elapsed. A
timestamp does not prove the writer stopped. Investigate a stuck writer and
preserve its record through separately authorized recovery; do not clear state
or remove its file to make the page look healthy. Download/contents checks can
still report an absent file. A retained list entry does not certify recoverability.

If pruning older archives fails after a new backup completes, the new backup
keeps its completed result. Cleanup records only a safe category/reference and
leaves older recovery identities available for retry. This does not certify
that count/age targets, every copy's hold handling or protected physical
recovery are satisfied.

Keep current hold/run/control and request evidence independent of old archives.
The legacy website restore operation is unavailable even with its historical
unsafe switch. See the [operator restore boundary](../deployment.md#application-restore-boundary).
