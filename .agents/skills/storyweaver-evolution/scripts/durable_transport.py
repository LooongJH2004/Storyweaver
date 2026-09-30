"""Verify the actual launcher, runner and dependencies before a fresh argv-only process."""
import hashlib
import json
import pathlib
import subprocess
import sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_new(path, data):
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        import os
        os.fsync(stream.fileno())


def main():
    config_path, expected_config, expected_launcher, operation, owner = sys.argv[1:]
    raw = pathlib.Path(config_path).read_bytes()
    if digest(raw) != expected_config:
        raise ValueError('transport config changed')
    config = json.loads(raw)
    if config['owner'] != owner:
        raise ValueError('transport owner rejected')
    directory = pathlib.Path(config['captureDirectory'])
    try:
        assert digest(pathlib.Path(__file__).read_bytes()) == expected_launcher, 'transport launcher changed'
        for path, expected in config['sourceFiles'].items():
            assert digest(pathlib.Path(path).read_bytes()) == expected, 'transport executed source changed'
        argv = ['node', config['runnerPath'], config_path, expected_config, operation, owner]
        result = subprocess.run(argv, capture_output=True)
        sequence = 'failure'
        if result.returncode == 0:
            try:
                proposed = json.loads(result.stdout)['sequence']
                if proposed == 'bootstrap' or type(proposed) is int and proposed >= 0:
                    sequence = proposed
            except (ValueError, KeyError, TypeError):
                pass  # Malformed runner output is captured under the fixed failure name.
        if directory.is_dir():
            prefix = directory / ('host-' + str(sequence))
            write_new(prefix.with_suffix('.stdout.bin'), result.stdout)
            write_new(prefix.with_suffix('.stderr.bin'), result.stderr)
            write_new(prefix.with_suffix('.json'), (json.dumps({'argv': argv, 'exitCode': result.returncode,
                'stdoutSha256': digest(result.stdout), 'stderrSha256': digest(result.stderr)}) + '\n').encode('utf8'))
        sys.stdout.buffer.write(result.stdout)
        sys.stderr.buffer.write(result.stderr)
        if sequence == 'failure' and result.returncode == 0:
            raise ValueError('transport runner output invalid')
        return result.returncode
    except Exception:
        if directory.is_symlink() or directory.exists() and directory.resolve() != directory.absolute():
            raise ValueError('transport directory link rejected')
        if not directory.exists():
            directory.mkdir()
        if not (directory / 'failed.json').exists():
            write_new(directory / 'failed.json', b'{"status":"failed"}')
        raise


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        sys.stderr.write('transport trusted launcher failed')
        sys.exit(1)
