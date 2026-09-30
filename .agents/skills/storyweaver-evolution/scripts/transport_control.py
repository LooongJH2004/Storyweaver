"""Read a frozen transport-only control record, verifying its expected source hash."""
import hashlib
import json
import pathlib
import sys


def load_control(path, expected_sha256):
    """Return trusted control source only when its registered UTF-8 digest matches."""
    record = json.loads(pathlib.Path(path).read_bytes().decode('utf8'))
    if record.get('kind') != 'frozen-transport-control' or not isinstance(record.get('source'), str):
        raise ValueError('transport control record type mismatch')
    digest = hashlib.sha256(record['source'].encode('utf8')).hexdigest()
    if digest != expected_sha256 or record.get('sourceSha256') != digest:
        raise ValueError('transport control source hash mismatch')
    return {'kind': 'verified-transport-control', 'source': record['source'], 'sourceSha256': digest}


if __name__ == '__main__':
    result = load_control(sys.argv[1], sys.argv[2])
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf8'))
