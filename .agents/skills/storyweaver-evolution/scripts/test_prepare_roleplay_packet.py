"""Focused tests for packet provenance, isolation and exact candidate edits."""
import json
import tempfile
import unittest
from pathlib import Path

from prepare_roleplay_packet import extract, synthesize


class PacketTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'replay.json'
        self.row = '{"ref":"person-one","label":"Nono"}'
        self.visible = '[CURRENT PEOPLE]\n[' + self.row + ']\n\nPlayer: refer to Nono as he.'
        self.replay = {'actorId': 'mashiro', 'result': 'GENERATED_SECRET',
                       'play': {'otherPrivate': 'OTHER_PRIVATE'}, 'actorSession': {'events': [
                           {'type': 'roleplay/execution-request', 'seq': 1, 'data': {'context': {
                               'actorId': 'mashiro', 'sources': ['beat:one'], 'sections': [
                                   {'sources': ['beat:one'], 'content': self.visible}]}}},
                           {'type': 'request/header', 'seq': 2, 'data': {'header': {
                               'config': {'credential': 'CREDENTIAL'}, 'system': self.visible,
                               'tools': [], 'historyMessages': [{'role': 'user', 'content': 'complete history'}]}}},
                           {'type': 'assistant/message', 'seq': 3, 'data': {'text': 'GENERATED_SECRET'}}]}}
        self.write()
        self.patch = {'sourceRef': 'beat:one', 'sourceText': 'refer to Nono as he.',
                      'personRef': 'person-one', 'target': {'field': 'system'},
                      'old': self.row, 'new': self.row[:-1] + ',"expressionReference":' + json.dumps({'scope': 'wording-only', 'pronoun': 'he', 'sourceRef': 'beat:one', 'sourceText': 'refer to Nono as he.'}) + '}'}

    def tearDown(self):
        self.directory.cleanup()

    def write(self):
        self.path.write_text(json.dumps(self.replay), encoding='utf-8')

    def test_isolated_complete_input(self):
        packet = extract(self.path)
        serialized = json.dumps(packet)
        for secret in ('GENERATED_SECRET', 'OTHER_PRIVATE', 'CREDENTIAL'):
            self.assertNotIn(secret, serialized)
        self.assertEqual(packet['input']['historyMessages'][0]['content'], 'complete history')
        self.assertEqual(len(packet['source']['sha256']), 64)

    def test_candidate_records_exact_patch(self):
        baseline = extract(self.path)
        candidate = synthesize(baseline, self.patch)
        self.assertEqual(baseline['input']['system'], self.visible)
        self.assertEqual(candidate['input']['system'], self.visible.replace(self.row, self.patch['new']))
        self.assertEqual(candidate['kind'], 'synthesized-candidate-actor-input')
        self.assertEqual(candidate['patch']['sourceText'], self.patch['sourceText'])

    def test_historical_same_person_object_is_preserved(self):
        baseline = extract(self.path)
        baseline['input']['system'] += '\nHistorical actor: ' + self.row
        candidate = synthesize(baseline, self.patch)
        self.assertTrue(candidate['input']['system'].endswith('Historical actor: ' + self.row))
        self.assertEqual(candidate['input']['system'].count('expressionReference'), 1)

    def test_reject_ambiguous_or_absent_replacement(self):
        for old in ('missing', 'Nono'):
            patch = dict(self.patch, old=old)
            with self.assertRaises(ValueError):
                synthesize(extract(self.path), patch)

    def test_reject_unseen_source(self):
        for change in ({'sourceRef': 'other-private'}, {'sourceText': 'unsupported he'}):
            with self.assertRaises(ValueError):
                synthesize(extract(self.path), dict(self.patch, **change))

    def test_reject_hidden_fact_change_or_existing_binding(self):
        packet = extract(self.path)
        with self.assertRaises(ValueError):
            synthesize(packet, dict(self.patch, new=self.patch['new'].replace('Nono', 'secret true name', 1)))
        with self.assertRaises(ValueError):
            synthesize(packet, dict(self.patch, new=self.patch['new'].replace('wording-only', 'world-fact')))
        with self.assertRaises(ValueError):
            synthesize(packet, dict(self.patch, old=self.patch['new']))

    def test_reject_duplicate_source_and_nonpeople_target(self):
        packet = extract(self.path)
        packet['executionSourceProvenance']['sections'] *= 2
        with self.assertRaises(ValueError):
            synthesize(packet, self.patch)
        packet = extract(self.path)
        packet['input']['system'] = packet['input']['system'].replace('[CURRENT PEOPLE]', '[MEMORY]')
        with self.assertRaises(ValueError):
            synthesize(packet, self.patch)

    def test_reject_multiple_requests_and_wrong_actor(self):
        self.replay['actorId'] = 'someone-else'
        self.write()
        with self.assertRaises(ValueError):
            extract(self.path)
        self.replay['actorId'] = 'mashiro'
        self.replay['actorSession']['events'].append(self.replay['actorSession']['events'][0])
        self.write()
        with self.assertRaises(ValueError):
            extract(self.path)


if __name__ == '__main__':
    unittest.main()
