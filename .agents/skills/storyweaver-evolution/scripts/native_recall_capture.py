"""Capture one native recall CLI process without shell evaluation or result-body stdout."""
import json, pathlib, subprocess, sys

def exclusive(path, value):
    with pathlib.Path(path).open('xb') as stream:
        stream.write(value)

if __name__ == '__main__':
    helper, config, manifest, arguments, directory = sys.argv[1:]
    target = pathlib.Path(directory)
    # The coordinator has already exclusively persisted arguments in this directory.
    assert target.is_dir() and pathlib.Path(arguments).parent.resolve() == target.resolve()
    with (target / 'process-claim.json').open('x', encoding='utf8') as stream:
        json.dump({'argv': ['node', helper, 'query', config, manifest, arguments, directory]}, stream)
    completed = subprocess.run(['node', helper, 'query', config, manifest, arguments, directory], capture_output=True, check=False)
    exclusive(target / 'stdout.bin', completed.stdout)
    exclusive(target / 'stderr.bin', completed.stderr)
    status = {'exitCode': completed.returncode, 'runningSession': False,
              'stdoutBytes': len(completed.stdout), 'stderrBytes': len(completed.stderr)}
    exclusive(target / 'process.json', (json.dumps(status, indent=2) + '\n').encode())
    print(json.dumps(status))
    sys.exit(0 if completed.returncode == 0 else 1)
