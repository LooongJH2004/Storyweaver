"""Archived inputs preserve each actor's recorded private context and command."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from extract_archive_actor_packet import recorded_wrapper, append_performance_rule
from prepare_roleplay_packet import extract


def archive_fixture():
    archive = {'formatVersion': 1, 'template': {'document': {'schemaVersion': 6}},
               'executionEvidence': [], 'commits': []}
    for actor, revision in [('elia', 5), ('nono', 3), ('ren', 9)]:
        context = {'actorId': actor, 'instanceId': 'story', 'revision': revision,
                   'sources': [actor + '-private'], 'sections': [{'content': actor + '-memory'}]}
        header = {'system': 'full-system-' + actor, 'tools': [{'name': 'npc_commit_turn'}],
                  'historyMessages': [{'role': 'user', 'content': actor + '-private'},
                                      {'role': 'assistant', 'content': 'recorded-history'}]}
        events = [{'seq': 3, 'type': 'roleplay/execution-request',
                   'data': {'attempt': actor + '-attempt', 'context': context}},
                  {'seq': 9, 'type': 'request/header', 'data': {'header': header}},
                  {'seq': 20, 'type': 'roleplay/execution-receipt', 'data': {
                      'commitId': actor + '-commit', 'instanceId': 'story',
                      'attempt': actor + '-attempt', 'revision': revision + 1}}]
        archive['executionEvidence'].append({'id': actor + '-evidence', 'content': {
            'format': 'harness-session-evidence', 'session': {'events': events}}})
        archive['commits'].append({'id': actor + '-commit', 'revision': revision + 1, 'command': {'kind': 'actor.submit-turn',
            'instanceId': 'story', 'expectedRevision': revision, 'input': {'original': actor},
            'principal': {'kind': 'actor', 'actorId': actor, 'attempt': actor + '-attempt', 'epoch': 0}}})
    return archive


class ArchivePackets(unittest.TestCase):
    def test_each_actor_gets_only_full_own_session_and_exact_original_command(self):
        archive = archive_fixture()
        original = copy.deepcopy(archive)
        for actor in ['elia', 'nono', 'ren']:
            wrapper = recorded_wrapper(archive, 'archive-sha', actor)
            own = next(e for e in archive['executionEvidence'] if e['id'] == actor + '-evidence')
            self.assertEqual(wrapper['actorSession'], own['content']['session'])
            command = next(c['command'] for c in archive['commits'] if c['id'] == actor + '-commit')
            self.assertEqual(wrapper['result']['command'], command)
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'wrapper.json'
                path.write_text(json.dumps(wrapper), encoding='utf-8')
                packet = extract(path)
            self.assertEqual(packet['input'], own['content']['session']['events'][1]['data']['header'])
            self.assertEqual(packet['executionSourceProvenance']['sources'], [actor + '-private'])
            self.assertEqual(packet['source']['executionRequestSeq'], 3)
            self.assertEqual(packet['source']['requestHeaderSeq'], 9)
        self.assertEqual(archive, original)

    def test_missing_and_ambiguous_headers_fail(self):
        for duplicate in [False, True]:
            archive = archive_fixture()
            events = archive['executionEvidence'][0]['content']['session']['events']
            if duplicate:
                events.append(copy.deepcopy(events[1]))
            else:
                events.pop(1)
            with self.assertRaisesRegex(ValueError, 'header'):
                recorded_wrapper(archive, 'sha', 'elia')

    def test_missing_ambiguous_or_wrong_actor_commands_fail(self):
        for mutation in ['missing', 'duplicate', 'wrong-actor', 'wrong-attempt', 'wrong-revision']:
            archive = archive_fixture()
            if mutation == 'missing':
                archive['commits'].pop(0)
            elif mutation == 'duplicate':
                archive['commits'].append(copy.deepcopy(archive['commits'][0]))
            elif mutation == 'wrong-revision':
                archive['commits'][0]['command']['expectedRevision'] = 999
            else:
                key = 'actorId' if mutation == 'wrong-actor' else 'attempt'
                archive['commits'][0]['command']['principal'][key] = 'wrong'
            with self.assertRaisesRegex(ValueError, 'command'):
                recorded_wrapper(archive, 'sha', 'elia')

    def test_duplicate_actor_sessions_and_mismatched_receipts_fail(self):
        archive = archive_fixture()
        archive['executionEvidence'].append(copy.deepcopy(archive['executionEvidence'][0]))
        with self.assertRaisesRegex(ValueError, 'session'):
            recorded_wrapper(archive, 'sha', 'elia')
        archive = archive_fixture()
        archive['executionEvidence'][0]['content']['session']['events'][2]['data']['revision'] = 99
        with self.assertRaisesRegex(ValueError, 'receipt'):
            recorded_wrapper(archive, 'sha', 'elia')

    def test_receipt_order_commit_revision_principal_and_complete_header_fail(self):
        for mutation in ['order', 'commit-revision', 'principal', 'header-field']:
            archive = archive_fixture()
            events = archive['executionEvidence'][0]['content']['session']['events']
            if mutation == 'order':
                events[2]['seq'] = 8
            elif mutation == 'commit-revision':
                archive['commits'][0]['revision'] = 99
            elif mutation == 'principal':
                archive['commits'][0]['command']['principal']['kind'] = 'player'
            else:
                del events[1]['data']['header']['historyMessages']
            with self.assertRaises(ValueError):
                recorded_wrapper(archive, 'sha', 'elia')

    def test_shared_rule_changes_only_one_author_text_and_preserves_provenance(self):
        packet = {'input': {'system': 'system', 'tools': [{'name': 'tool'}],
            'historyMessages': [{'content': [{'type': 'text', 'text': 'before\nperformance\nafter'}]}]},
            'executionSourceProvenance': {'sections': [{'id': 'performance', 'content': 'performance'}]}}
        original = copy.deepcopy(packet)
        candidate = append_performance_rule(packet, 'shared rule')
        self.assertEqual(candidate['input']['historyMessages'][0]['content'][0]['text'],
                         'before\nperformance\nshared rule\nafter')
        self.assertEqual(candidate['input']['system'], packet['input']['system'])
        self.assertEqual(candidate['input']['tools'], packet['input']['tools'])
        self.assertEqual(candidate['executionSourceProvenance'], packet['executionSourceProvenance'])
        self.assertEqual(packet, original)
        packet['input']['historyMessages'][0]['content'][0]['text'] += '\nperformance'
        with self.assertRaisesRegex(ValueError, 'exactly once'):
            append_performance_rule(packet, 'shared rule')


if __name__ == '__main__':
    unittest.main()
