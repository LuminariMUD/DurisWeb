"""Actual Linux lease tests; only syscall scheduling/failure is injected."""

import errno
import fcntl
import importlib.util
import mmap
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

workerPath = pathlib.Path(__file__).resolve().parents[1] / 'legacyFileLeaseWorker.py'
spec = importlib.util.spec_from_file_location('legacy_file_lease_worker', workerPath)
assert spec and spec.loader
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FileLeaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='durisweb-file-lease-')
        self.root = pathlib.Path(self.directory.name)
        self.sourcePath = self.root / 'source'
        self.bytes = b'private-fixture-sentinel\x00\xff' * 4096
        self.sourcePath.write_bytes(self.bytes)
        self.source = os.open(self.sourcePath, os.O_RDONLY | os.O_NONBLOCK)
        self.destination = os.open(self.root / 'destination', os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        self.expected = worker.physicalSha256(os.fstat(self.source))

    def tearDown(self):
        os.close(self.source)
        os.close(self.destination)
        self.directory.cleanup()

    def copy(self, limit=1024 * 1024, budget=5000, expected=None):
        return worker.copyLeasedFile(self.source, self.destination, limit, budget,
                                       expected or self.expected)

    def test_real_closed_file_lease_and_independent_copied_byte_verification(self):
        result = self.copy()
        self.assertEqual(result['outcome'], 'copied')
        self.assertEqual(result['bytes'], len(self.bytes))
        self.assertEqual((self.root / 'destination').read_bytes(), self.bytes)
        self.assertEqual(self.sourcePath.read_bytes(), self.bytes)
        self.assertEqual(fcntl.fcntl(self.source, fcntl.F_GETLEASE), fcntl.F_UNLCK)

    def test_existing_writer_is_refused_without_copy_or_source_mutation(self):
        writing = os.open(self.sourcePath, os.O_WRONLY)
        try:
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy()
            self.assertEqual(problem.exception.reason, 'writer_active')
            self.assertEqual(os.fstat(self.destination).st_size, 0)
            self.assertEqual(self.sourcePath.read_bytes(), self.bytes)
        finally:
            os.close(writing)

    def test_actual_competing_write_open_interrupts_the_lease_before_success(self):
        originalRead = os.read
        attempted = False

        def read(fd, size):
            nonlocal attempted
            if fd == self.source and not attempted:
                attempted = True
                with self.assertRaises(OSError) as failure:
                    os.open(self.sourcePath, os.O_WRONLY | os.O_NONBLOCK)
                self.assertEqual(failure.exception.errno, errno.EAGAIN)
            return originalRead(fd, size)

        with patch.object(worker.os, 'read', side_effect=read):
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy()
        self.assertTrue(attempted)
        self.assertEqual(problem.exception.reason, 'lease_interrupted')
        self.assertEqual(self.sourcePath.read_bytes(), self.bytes)
        self.assertEqual(fcntl.fcntl(self.source, fcntl.F_GETLEASE), fcntl.F_UNLCK)
        writing = os.open(self.sourcePath, os.O_WRONLY | os.O_NONBLOCK)
        os.close(writing)

    def test_writable_mapping_remains_a_writer_after_its_descriptor_is_closed(self):
        writing = os.open(self.sourcePath, os.O_RDWR)
        mapping = mmap.mmap(writing, 0, access=mmap.ACCESS_WRITE)
        os.close(writing)
        try:
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy()
            self.assertEqual(problem.exception.reason, 'writer_active')
            self.assertEqual(os.fstat(self.destination).st_size, 0)
        finally:
            mapping.close()

    def test_changed_physical_identity_and_existing_destination_are_refused(self):
        with self.assertRaises(worker.CopyRefused) as problem:
            self.copy(expected='0' * 64)
        self.assertEqual(problem.exception.reason, 'source_unverified')
        os.write(self.destination, b'preserve prior output')
        with self.assertRaises(worker.CopyRefused) as problem:
            self.copy()
        self.assertEqual(problem.exception.reason, 'destination_unverified')
        self.assertEqual((self.root / 'destination').read_bytes(), b'preserve prior output')

    def test_limits_and_lost_parent_refuse_before_claiming_a_copy(self):
        with self.assertRaises(worker.CopyRefused) as problem:
            self.copy(limit=1)
        self.assertEqual(problem.exception.reason, 'byte_limit')
        with patch.object(worker.time, 'monotonic', side_effect=[0, 1]):
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy(budget=1)
        self.assertEqual(problem.exception.reason, 'time_budget')
        with patch.object(worker.os, 'getppid', return_value=1):
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy()
        self.assertEqual(problem.exception.reason, 'lease_interrupted')

    def test_write_failure_releases_the_lease_and_retains_any_partial_file(self):
        with patch.object(worker.os, 'write', side_effect=OSError(errno.ENOSPC, 'synthetic private detail')):
            with self.assertRaises(worker.CopyRefused) as problem:
                self.copy()
        self.assertEqual(problem.exception.reason, 'copy_unconfirmed')
        self.assertTrue((self.root / 'destination').exists())
        self.assertEqual(fcntl.fcntl(self.source, fcntl.F_GETLEASE), fcntl.F_UNLCK)
        self.assertEqual(self.sourcePath.read_bytes(), self.bytes)

    def test_zero_length_closed_source_is_a_byte_copy_not_a_restore_claim(self):
        os.close(self.source)
        self.sourcePath.write_bytes(b'')
        self.source = os.open(self.sourcePath, os.O_RDONLY)
        self.expected = worker.physicalSha256(os.fstat(self.source))
        self.assertEqual(self.copy()['bytes'], 0)


if __name__ == '__main__':
    unittest.main()
