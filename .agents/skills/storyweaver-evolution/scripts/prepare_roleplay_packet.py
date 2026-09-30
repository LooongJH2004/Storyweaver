"""Extract one Actor's recorded input; optionally apply one reviewed exact patch.

No API calls, context shortening, archive projection, or output rewriting occur.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def digest(value):
    return hashlib.sha256(value).hexdigest()


def read_json(path):
    raw = Path(path).read_bytes()
    return json.loads(raw.decode('utf-8-sig')), digest(raw)


def select_recorded_input(events, actor, execution_request_seq=None, request_header_seq=None):
    """Select explicit request/header coordinates without filtering session events."""
    requests = [e for e in events if e['type'] == 'roleplay/execution-request']
    headers = [e for e in events if e['type'] == 'request/header']
    if (execution_request_seq is None) != (request_header_seq is None):
        raise ValueError('Both execution request and header seq must be explicit')
    if execution_request_seq is None and (len(requests) != 1 or len(headers) != 1):
        raise ValueError('Multiple execution requests or headers require both explicit seq values')
    seqs = [e['seq'] for e in events]
    if any(not isinstance(seq, int) or isinstance(seq, bool) for seq in seqs) or seqs != sorted(set(seqs)):
        raise ValueError('Session seq must be unique and increasing; ambiguous request/header')
    if any(e['data']['context']['actorId'] != actor for e in requests):
        raise ValueError('Actor identity mismatch')
    chosen_requests = requests if execution_request_seq is None else [e for e in requests if e['seq'] == execution_request_seq]
    chosen_headers = headers if request_header_seq is None else [e for e in headers if e['seq'] == request_header_seq]
    if len(chosen_requests) != 1 or len(chosen_headers) != 1:
        raise ValueError('Exactly one selected execution request and header are required')
    request, header = chosen_requests[0], chosen_headers[0]
    next_request = next((e['seq'] for e in requests if e['seq'] > request['seq']), None)
    if request['seq'] >= header['seq'] or (next_request is not None and header['seq'] >= next_request):
        raise ValueError('Header must belong to selected execution request')
    if any(e['data']['context'].get('instanceId') != request['data']['context'].get('instanceId') for e in requests):
        raise ValueError('Session instance identity mismatch')
    receipts = [e for e in events if e['type'] == 'roleplay/execution-receipt'
                and e['data'].get('attempt') == request['data'].get('attempt')
                and e['data'].get('instanceId') == request['data']['context'].get('instanceId')]
    if receipts and (len(receipts) != 1 or header['seq'] >= receipts[0]['seq']
            or (next_request is not None and receipts[0]['seq'] >= next_request)):
        raise ValueError('Selected header must precede its unique execution receipt')
    body = header['data']['header']
    if not isinstance(body.get('system'), str) or not isinstance(body.get('tools'), list) or not isinstance(body.get('historyMessages'), list):
        raise ValueError('Complete recorded header is required')
    return request, header, next_request


def extract(path, execution_request_seq=None, request_header_seq=None):
    replay, sha = read_json(path)
    actor = replay['actorId']
    events = replay['actorSession']['events']
    selection = replay.get('selection', {})
    if selection and (execution_request_seq is not None or request_header_seq is not None):
        if execution_request_seq != selection.get('executionRequestSeq') or request_header_seq != selection.get('requestHeaderSeq'):
            raise ValueError('Explicit coordinates conflict with recorded wrapper selection')
    if execution_request_seq is None and request_header_seq is None:
        execution_request_seq = selection.get('executionRequestSeq')
        request_header_seq = selection.get('requestHeaderSeq')
    request, selected_header, _ = select_recorded_input(events, actor, execution_request_seq, request_header_seq)
    if selection:
        receipts = [e for e in events if e['type'] == 'roleplay/execution-receipt'
                    and e['seq'] == selection.get('receiptSeq')]
        if (len(receipts) != 1 or receipts[0] != replay.get('originalExecutionReceipt')
                or receipts[0]['data']['commitId'] != selection.get('commitId')
                or replay.get('originalCommit', {}).get('id') != selection.get('commitId')
                or receipts[0]['data']['attempt'] != request['data']['attempt']
                or receipts[0]['data']['instanceId'] != request['data']['context']['instanceId']):
            raise ValueError('Recorded wrapper selection receipt/commit identity mismatch')
    context = request['data']['context']
    header = selected_header['data']['header']
    # These are the recorded effective inputs, not a reconstruction from the archive.
    packet = {'schemaVersion': 1, 'kind': 'recorded-actor-input', 'actorId': actor,
              'source': {'sha256': sha, 'executionRequestSeq': request['seq'],
                         'requestHeaderSeq': selected_header['seq']},
              'input': {k: copy.deepcopy(header[k]) for k in ('system', 'tools', 'historyMessages')},
              'executionSourceProvenance': {'actorId': actor, 'sources': copy.deepcopy(context['sources']),
                            'sections': copy.deepcopy(context['sections'])}}
    if selection:
        packet['source']['receiptSeq'] = selection['receiptSeq']
        packet['source']['commitId'] = selection['commitId']
    return packet


def text_at(packet, target):
    if target == {'field': 'system'}:
        return packet['input'], 'system'
    if target.get('field') != 'historyMessages':
        raise ValueError('Patch target must be system or a history text block')
    message = packet['input']['historyMessages'][target['messageIndex']]
    content = message['content']
    if isinstance(content, str):
        return message, 'content'
    block = content[target['blockIndex']]
    if block['type'] != 'text':
        raise ValueError('Patch target must be text')
    return block, 'text'


def string_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from string_values(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from string_values(item)


def synthesize(packet, specification):
    candidate = copy.deepcopy(packet)
    source_ref = specification['sourceRef']
    source_text = specification['sourceText']
    sections = packet['executionSourceProvenance']['sections']
    matches = [s for s in sections if source_ref in s['sources'] and source_text in s['content']]
    if not source_text or len(matches) != 1:
        raise ValueError('Binding source must occur in exactly one visible source section')
    if not any(source_text in text for text in string_values(packet['input'])):
        raise ValueError('Binding source text must also be present in recorded model input')
    if source_ref not in packet['executionSourceProvenance']['sources']:
        raise ValueError('Binding source is not visible to this Actor')
    old, new = specification['old'], specification['new']
    person_ref = specification['personRef']
    before, after = json.loads(old), json.loads(new)
    if not isinstance(before, dict) or not isinstance(after, dict):
        raise ValueError('People replacement must contain complete JSON objects')
    if before.get('ref') != person_ref or after.get('ref') != person_ref:
        raise ValueError('People ref must match personRef')
    if 'expressionReference' in before or set(after) != set(before) | {'expressionReference'}:
        raise ValueError('Only one new expressionReference field is allowed')
    if any(after[k] != v for k, v in before.items()):
        raise ValueError('Existing people fields must be unchanged')
    binding = after['expressionReference']
    if not isinstance(binding, dict) or set(binding) != {'scope', 'pronoun', 'sourceRef', 'sourceText'}:
        raise ValueError('Binding requires scope/pronoun/sourceRef/sourceText only')
    if (binding['scope'] != 'wording-only' or not isinstance(binding['pronoun'], str)
            or not binding['pronoun'].strip() or binding['sourceRef'] != source_ref
            or binding['sourceText'] != source_text):
        raise ValueError('Binding must be nonempty wording-only guidance with the reviewed source')
    if not old.endswith('}') or not new.startswith(old[:-1] + ','):
        raise ValueError('Preserve original object bytes and append the binding before its final brace')
    owner, key = text_at(candidate, specification['target'])
    original = owner[key]
    marker = '[CURRENT PEOPLE]'
    if original.count(marker) != 1:
        raise ValueError('Target must contain exactly one CURRENT PEOPLE section')
    people_text = original.split(marker, 1)[1].split('\n\n', 1)[0]
    people_lines = [line for line in people_text.splitlines() if line.startswith('[') or line.startswith('{')]
    if len(people_lines) != 1 or people_lines[0].count(old) != 1:
        raise ValueError('Exact object must be in the CURRENT PEOPLE JSON row')
    people = json.loads(people_lines[0])
    rows = people if isinstance(people, list) else [people]
    if sum(isinstance(row, dict) and row.get('ref') == person_ref for row in rows) != 1:
        raise ValueError('Person ref must identify exactly one CURRENT PEOPLE object')
    section_start = original.index(marker) + len(marker)
    offset = original.index(old, section_start, section_start + len(people_text))
    owner[key] = original[:offset] + new + original[offset + len(old):]
    candidate['kind'] = 'synthesized-candidate-actor-input'
    candidate['patch'] = copy.deepcopy(specification)
    candidate['patch']['offset'] = offset
    candidate['patch']['beforeSha256'] = digest(original.encode('utf-8'))
    candidate['patch']['afterSha256'] = digest(owner[key].encode('utf-8'))
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--execution-request-seq', type=int)
    parser.add_argument('--request-header-seq', type=int)
    parser.add_argument('--patch', help='Reviewed JSON exact replacement with sourceRef/sourceText/personRef/target/old/new')
    args = parser.parse_args()
    packet = extract(args.replay, args.execution_request_seq, args.request_header_seq)
    if args.patch:
        specification, sha = read_json(args.patch)
        packet = synthesize(packet, specification)
        packet['patch']['specificationSha256'] = sha
    output = json.dumps(packet, ensure_ascii=False, indent=2) + '\n'
    with Path(args.output).open('x', encoding='utf-8', newline='\n') as handle:
        handle.write(output)


if __name__ == '__main__':
    main()
