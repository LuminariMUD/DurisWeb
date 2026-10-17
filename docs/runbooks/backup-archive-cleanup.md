# Backup archive cleanup and recovery

These are prepared source safeguards for the existing manual/hourly count
limits and explicit administrative cleanup. They approve no new age period or
actual archive operation. The prepared [managed ZIP admission protocol](managed-archive-holds.md)
now enforces validated holds and retains durable removal receipts. Uploads and
legacy dump/staging workspaces, independently protected evidence and offline replay
remain required P6 work. The hold API still reports global
`enforcementReady: false`; no complete copy/restore protection is claimed.

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
safeguards, not independent proof of physical copy disposal or durable upload
recovery after leaving the page.

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
