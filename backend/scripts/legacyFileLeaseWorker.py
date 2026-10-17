"""Descriptor-only Linux preservation worker; no path, environment or source payload output."""

from __future__ import annotations

import argparse
import errno
import fcntl
import hashlib
import json
import os
import re
import resource
import signal
import stat
import sys
import time


class CopyRefused(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def physicalSha256(value: os.stat_result) -> str:
    fields = [value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
              value.st_size, value.st_mtime_ns, value.st_ctime_ns]
    return hashlib.sha256(json.dumps([str(item) for item in fields], separators=(',', ':')).encode()).hexdigest()


def copyLeasedFile(source: int, destination: int, maxBytes: int,
                     timeBudgetMs: int, expectedPhysicalSha256: str) -> dict[str, object]:
    if (sys.platform != 'linux' or type(maxBytes) is not int or not 1 <= maxBytes <= 2**40
            or type(timeBudgetMs) is not int or not 1 <= timeBudgetMs <= 300000
            or not re.fullmatch('[a-f0-9]{64}', expectedPhysicalSha256)):
        raise CopyRefused('invalid_arguments')
    started = time.monotonic()
    originalParent = os.getppid()
    if originalParent <= 1:
        raise CopyRefused('lease_interrupted')
    interrupted = False
    leased = False

    def interrupt(_signum: int, _frame: object) -> None:
        nonlocal interrupted
        interrupted = True

    previous = {number: signal.signal(number, interrupt)
                for number in (signal.SIGIO, signal.SIGTERM, signal.SIGINT)}

    def check() -> None:
        if interrupted or os.getppid() != originalParent:
            raise CopyRefused('lease_interrupted')
        if (time.monotonic() - started) * 1000 >= timeBudgetMs:
            raise CopyRefused('time_budget')
        if leased and fcntl.fcntl(source, fcntl.F_GETLEASE) != fcntl.F_RDLCK:
            raise CopyRefused('lease_interrupted')

    try:
        before, target = os.fstat(source), os.fstat(destination)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                or physicalSha256(before) != expectedPhysicalSha256
                or (fcntl.fcntl(source, fcntl.F_GETFL) & os.O_ACCMODE) != os.O_RDONLY):
            raise CopyRefused('source_unverified')
        if (not stat.S_ISREG(target.st_mode) or target.st_nlink != 1 or target.st_size != 0
                or target.st_uid != os.geteuid() or stat.S_IMODE(target.st_mode) & 0o077
                or (before.st_dev, before.st_ino) == (target.st_dev, target.st_ino)
                or (fcntl.fcntl(destination, fcntl.F_GETFL) & os.O_ACCMODE) != os.O_RDWR):
            raise CopyRefused('destination_unverified')
        if before.st_size > maxBytes:
            raise CopyRefused('byte_limit')
        fcntl.fcntl(source, fcntl.F_SETOWN, os.getpid())
        try:
            fcntl.fcntl(source, fcntl.F_SETLEASE, fcntl.F_RDLCK)
        except OSError as failure:
            raise CopyRefused('writer_active' if failure.errno in (errno.EAGAIN, errno.EACCES)
                              else 'lease_unavailable') from None
        leased = True
        check()
        if physicalSha256(os.fstat(source)) != expectedPhysicalSha256:
            raise CopyRefused('source_changed')
        digest, count = hashlib.sha256(), 0
        os.lseek(source, 0, os.SEEK_SET)
        os.lseek(destination, 0, os.SEEK_SET)
        while True:
            check()
            block = os.read(source, 65536)
            if not block:
                break
            count += len(block)
            if count > maxBytes or count > before.st_size:
                raise CopyRefused('source_changed')
            digest.update(block)
            position = 0
            while position < len(block):
                check()
                written = os.write(destination, block[position:])
                if written <= 0:
                    raise CopyRefused('copy_unconfirmed')
                position += written
        os.fsync(destination)
        check()
        if count != before.st_size or physicalSha256(os.fstat(source)) != expectedPhysicalSha256:
            raise CopyRefused('source_changed')
        copied = os.fstat(destination)
        if (copied.st_dev, copied.st_ino) != (target.st_dev, target.st_ino) or copied.st_size != count:
            raise CopyRefused('destination_unverified')
        verified = hashlib.sha256()
        os.lseek(destination, 0, os.SEEK_SET)
        remaining = count
        while remaining:
            check()
            block = os.read(destination, min(65536, remaining))
            if not block:
                raise CopyRefused('copy_unconfirmed')
            verified.update(block)
            remaining -= len(block)
        check()
        if (verified.digest() != digest.digest() or os.fstat(destination).st_size != count
                or physicalSha256(os.fstat(source)) != expectedPhysicalSha256):
            raise CopyRefused('copy_unconfirmed')
        return {'format': 1, 'outcome': 'copied', 'bytes': count,
                'sha256': digest.hexdigest(), 'sourcePhysicalSha256': expectedPhysicalSha256}
    except CopyRefused:
        raise
    except (OSError, ValueError):
        raise CopyRefused('copy_unconfirmed') from None
    finally:
        if leased:
            fcntl.fcntl(source, fcntl.F_SETLEASE, fcntl.F_UNLCK)
        for number, handler in previous.items():
            signal.signal(number, handler)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--max-bytes', dest='maxBytes', required=True, type=int)
    parser.add_argument('--time-budget-ms', dest='timeBudgetMs', required=True, type=int)
    parser.add_argument('--expected-physical-sha256', dest='expectedPhysicalSha256', required=True)
    options = parser.parse_args()
    try:
        resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
        result = copyLeasedFile(3, 4, options.maxBytes, options.timeBudgetMs,
                                  options.expectedPhysicalSha256)
        print(json.dumps(result, separators=(',', ':')), flush=True)
        return 0
    except CopyRefused as failure:
        print(json.dumps({'format': 1, 'outcome': 'refused', 'reason': failure.reason}), flush=True)
        return 2
    except Exception:
        print('{"format":1,"outcome":"refused","reason":"copy_unconfirmed"}', flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
