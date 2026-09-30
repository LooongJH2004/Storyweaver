"""Focused offline evidence preservation checks."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from bootstrap_capture import promote, write_new


class EvidenceTests(unittest.TestCase):
    def test_capture_failure_and_exclusive_directory(self):
        with tempfile.TemporaryDirectory() as root:
            directory = pathlib.Path(root) / 'capture'
            command = [sys.executable, str(pathlib.Path(__file__).with_name('bootstrap_capture.py')), 'capture', str(pathlib.Path(root) / 'missing.json'), str(directory), shutil.which('pwsh')]
            result = subprocess.run(command, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            record = json.loads((directory / 'process.json').read_text('utf8'))
            self.assertEqual(record['status'], 'failed')
            self.assertTrue(record['stderrPresent'])
            self.assertTrue((directory / 'stderr.bin').read_bytes())
            before = {path.name: path.read_bytes() for path in directory.iterdir()}
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual({path.name: path.read_bytes() for path in directory.iterdir()}, before)

    def test_large_return_and_exclusive_target(self):
        with tempfile.TemporaryDirectory() as root:
            staging = pathlib.Path(root) / 'staged.json'
            target = pathlib.Path(root) / 'return.json'
            output = '中文😀\r\n`$() truncated\\"\x00' * 20000
            original = {'output': output, 'exit_code': 0, 'unknown': [None, {'a': 'b'}]}
            data = (json.dumps(original, ensure_ascii=False) + '\n').encode('utf8')
            write_new(staging, data)
            promote(staging, target)
            self.assertEqual(target.read_bytes(), data)
            self.assertEqual(json.loads(target.read_text('utf8')), original)
            with self.assertRaises(FileExistsError):
                promote(staging, target)
            self.assertEqual(target.read_bytes(), data)

    def test_invalid_staging_does_not_create_return(self):
        with tempfile.TemporaryDirectory() as root:
            staging = pathlib.Path(root) / 'staged.json'
            target = pathlib.Path(root) / 'return.json'
            write_new(staging, b'{')
            with self.assertRaises(json.JSONDecodeError):
                promote(staging, target)
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
