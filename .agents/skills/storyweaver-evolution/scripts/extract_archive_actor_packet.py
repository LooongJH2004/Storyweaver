"""Copy one complete archived Actor session and its uniquely receipted command.

The wrapper is recorded-session evidence, not a reconstructed runtime capture.
No archive conversion, private-context merging, or model calls occur.
"""
import argparse
import copy
import json
from pathlib import Path
from prepare_roleplay_packet import digest, extract, read_json, select_recorded_input


def append_performance_rule(packet, rule):
    """Append one author rule to exactly one recorded performance section occurrence."""
    if not isinstance(rule, str) or not rule.strip() or '\n' in rule:
        raise ValueError('One nonempty rule sentence is required')
    sections = [s for s in packet['executionSourceProvenance']['sections'] if s['id'] == 'performance']
    if len(sections) != 1 or not sections[0]['content']:
        raise ValueError('Exactly one recorded performance section is required')
    old = sections[0]['content']
    candidate = copy.deepcopy(packet)
    matches = []
    if candidate['input']['system'].count(old):
        matches.append((candidate['input'], 'system', {'field': 'system'}))
    for i, message in enumerate(candidate['input']['historyMessages']):
        if isinstance(message['content'], str):
            if message['content'].count(old):
                matches.append((message, 'content', {'field': 'historyMessages', 'messageIndex': i}))
        else:
            for j, block in enumerate(message['content']):
                if block['type'] == 'text' and block['text'].count(old):
                    matches.append((block, 'text', {'field': 'historyMessages', 'messageIndex': i, 'blockIndex': j}))
    if len(matches) != 1 or matches[0][0][matches[0][1]].count(old) != 1:
        raise ValueError('Performance section must occur exactly once in complete input')
    owner, key, target = matches[0]
    before = owner[key]
    offset = before.index(old) + len(old)
    addition = '\n' + rule
    owner[key] = before[:offset] + addition + before[offset:]
    candidate['kind'] = 'synthesized-candidate-actor-input'
    candidate['patch'] = {'kind': 'append-shared-author-performance-rule', 'target': target,
        'offset': offset, 'addition': addition, 'beforeSha256': digest(before.encode('utf-8')),
        'afterSha256': digest(owner[key].encode('utf-8'))}
    return candidate


def recorded_wrapper(archive, archive_sha, actor_id, execution_request_seq=None, request_header_seq=None):
    """Select one actor's full session and require its original receipt/command link."""
    matches = []
    for evidence in archive['executionEvidence']:
        content = evidence['content']
        if content.get('format') != 'harness-session-evidence':
            continue
        requests = [e for e in content['session']['events'] if e['type'] == 'roleplay/execution-request']
        if any(e['data']['context']['actorId'] == actor_id for e in requests):
            matches.append((evidence, requests))
    if len(matches) != 1:
        raise ValueError('Exactly one archived Actor session is required')
    evidence, requests = matches[0]
    session = evidence['content']['session']
    request, header, next_request = select_recorded_input(session['events'], actor_id, execution_request_seq, request_header_seq)
    context = request['data']['context']
    if request['seq'] >= header['seq']:
        raise ValueError('Execution request must precede header')
    receipts = [e for e in session['events'] if e['type'] == 'roleplay/execution-receipt'
                and e['data']['attempt'] == request['data']['attempt']
                and e['data']['instanceId'] == context['instanceId']]
    if len(receipts) != 1:
        raise ValueError('Exactly one original execution receipt is required')
    receipt = receipts[0]
    if header['seq'] >= receipt['seq'] or (next_request is not None and receipt['seq'] >= next_request):
        raise ValueError('Original header must precede execution receipt')
    for key in ('system', 'tools', 'historyMessages'):
        if key not in header['data']['header']:
            raise ValueError('Complete recorded header is required')
    linked_commits = [commit for commit in archive['commits'] if commit['id'] == receipt['data']['commitId']]
    if len(linked_commits) != 1:
        raise ValueError('Exactly one globally unique receipt-linked original Actor command is required')
    commands = []
    for commit in linked_commits:
        command = commit['command']
        principal = command['principal']
        if (commit['id'] == receipt['data']['commitId']
                and command['kind'] == 'actor.submit-turn'
                and command['instanceId'] == context['instanceId']
                and command['expectedRevision'] == context['revision']
                and principal.get('kind') == 'actor'
                and principal.get('actorId') == actor_id
                and principal.get('attempt') == request['data']['attempt']):
            commands.append(commit)
    if len(commands) != 1:
        raise ValueError('Exactly one receipt-linked original Actor command is required')
    commit = commands[0]
    if (receipt['data']['instanceId'] != context['instanceId']
            or receipt['data']['attempt'] != request['data']['attempt']
            or receipt['data']['revision'] != context['revision'] + 1
            or commit['revision'] != receipt['data']['revision']):
        raise ValueError('Original execution receipt does not match request revision/attempt')
    return copy.deepcopy({'kind': 'recorded-session-wrapper', 'actorId': actor_id,
        'selection': {'executionRequestSeq': request['seq'], 'requestHeaderSeq': header['seq'],
            'receiptSeq': receipt['seq'], 'commitId': commit['id']},
        'actorSession': session, 'sourceArchive': {'sha256': archive_sha,
        'evidenceId': evidence['id'], 'sessionSha256': digest(json.dumps(session, ensure_ascii=False,
        separators=(',', ':')).encode('utf-8')), 'formatVersion': archive['formatVersion'],
        'templateSchemaVersion': archive['template']['document']['schemaVersion'],
        'producerBuild': 'unknown'}, 'originalExecutionReceipt': receipt,
        'originalCommit': commit, 'result': {'command': commit['command']}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--actor', required=True)
    parser.add_argument('--wrapper', required=True)
    parser.add_argument('--packet', required=True)
    parser.add_argument('--execution-request-seq', type=int)
    parser.add_argument('--request-header-seq', type=int)
    args = parser.parse_args()
    archive, sha = read_json(args.archive)
    wrapper = recorded_wrapper(archive, sha, args.actor, args.execution_request_seq, args.request_header_seq)
    # Refuse an existing output before writing either file.
    if Path(args.wrapper).exists() or Path(args.packet).exists():
        raise FileExistsError('Wrapper and packet outputs must both be new')
    with Path(args.wrapper).open('x', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(wrapper, ensure_ascii=False, indent=2) + '\n')
    try:
        packet = extract(args.wrapper)
        with Path(args.packet).open('x', encoding='utf-8', newline='\n') as handle:
            handle.write(json.dumps(packet, ensure_ascii=False, indent=2) + '\n')
    except Exception:
        # Remove only this invocation's new wrapper; no existing artifact is touched.
        Path(args.wrapper).unlink()
        raise


if __name__ == '__main__':
    main()
