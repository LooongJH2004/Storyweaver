"""Capture one complete bootstrap and promote an actual serialized tool return.

All evidence files use exclusive creation. JSON data is never executed as shell code.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import threading


def write_new(path, data):
    """Write bytes to a new file, refusing an existing target."""
    with pathlib.Path(path).open('xb') as stream:
        stream.write(data)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def capture(source, destination, powershell):
    """Run the fixed Get-Content script once and preserve and relay both streams."""
    directory = pathlib.Path(destination)
    directory.mkdir()
    script = pathlib.Path(__file__).with_name('bootstrap_read.ps1')
    argv = [powershell, '-NoLogo', '-NoProfile', '-File', str(script), '-InputPath', str(pathlib.Path(source).resolve())]
    write_new(directory / 'started.json', json_bytes({'argv': argv, 'cwd': str(pathlib.Path.cwd()), 'python': sys.version, 'tty': False}))
    failures = []
    try:
        environment = {key: value for key, value in os.environ.items() if not any(term in key.upper() for term in ['KEY', 'SECRET', 'TOKEN', 'PASSWORD'])}
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
        def drain(pipe, name, relay):
            try:
                with (directory / name).open('xb') as stream:
                    while chunk := pipe.read(65536):
                        stream.write(chunk)
                        stream.flush()
                        relay.write(chunk)
                        relay.flush()
            except Exception as error:
                failures.append(repr(error))
                process.kill()
        threads = [threading.Thread(target=drain, args=(process.stdout, 'stdout.bin', sys.stdout.buffer)), threading.Thread(target=drain, args=(process.stderr, 'stderr.bin', sys.stderr.buffer))]
        for thread in threads:
            thread.start()
        code = process.wait()
        for thread in threads:
            thread.join()
        streams = {name: {'bytes': (directory / name).stat().st_size, 'sha256': hashlib.sha256((directory / name).read_bytes()).hexdigest()} for name in ['stdout.bin', 'stderr.bin'] if (directory / name).exists()}
        stderr_present = streams.get('stderr.bin', {}).get('bytes', 0) != 0
        write_new(directory / 'process.json', json_bytes({'status': 'complete' if code == 0 and not failures and not stderr_present else 'failed', 'exitCode': code, 'stderrPresent': stderr_present, 'captureErrors': failures, 'streams': streams}))
        return code if code else (1 if failures or stderr_present else 0)
    except Exception as error:
        write_new(directory / 'failure.json', json_bytes({'status': 'failed', 'error': repr(error)}))
        return 1


def promote(staging, destination):
    """Validate staged JSON and exclusively persist its complete UTF-8 bytes."""
    data = pathlib.Path(staging).read_bytes()
    value = json.loads(data.decode('utf-8'))
    if not isinstance(value, dict) or not isinstance(value.get('output'), str):
        raise ValueError('actual return must be an object with string output')
    write_new(destination, data)
    return {'status': 'saved', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    read = commands.add_parser('capture')
    read.add_argument('source')
    read.add_argument('destination')
    read.add_argument('powershell')
    save = commands.add_parser('promote')
    save.add_argument('staging')
    save.add_argument('destination')
    args = parser.parse_args()
    if args.command == 'capture':
        sys.exit(capture(args.source, args.destination, args.powershell))
    print(json.dumps(promote(args.staging, args.destination)))
