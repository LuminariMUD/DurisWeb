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
pruning. No automatic upload expiry period has been approved or implemented.

File close/flush and directory sync precede the inspection checkpoint. A separate
read-only process receives no application environment or SQL credentials, executes
no SQL and extracts no files. Inspection allows one SQL member, at most 10,000 ZIP
entries, 64 MiB decompressed SQL and 5,000 account/character summary items each,
with a 256 KiB summary and 192 MiB V8 heap limit. Its own 15-second deadline and
the parent's 16-second deadline bound work. This checks a supported format and
summary; it does not approve or certify a restore. Budget exhaustion, malformed
ZIP/parser failure and uncertain storage are retained for review, not discarded
as confirmed invalid. Physical identity is rechecked before acknowledgement.

Known format/size rejection requests the existing managed remover after the writer
is closed. Every active hold scope preserves the entire archive. Cancellation,
including retries, requires a matching completed removal receipt before success;
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

Closed retained uploads offer download and cancellation from the list after a
page reload. Both require owner/overlord access; pending writers cannot be
downloaded or removed. Holds or uncertainty return a failed operation with a safe
reference and retain work. Existing legacy OS-temporary uploads are not adopted,
unlinked or falsely acknowledged by these endpoints. Website restore remains
unavailable. Protect independent current evidence before any authorized offline
restore; these upload safeguards do not establish all-copy enforcement.

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
