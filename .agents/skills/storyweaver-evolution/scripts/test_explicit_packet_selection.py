"""Full-session explicit coordinate and receipt ownership checks."""
import copy
import unittest
import tempfile
import json
from pathlib import Path
from prepare_roleplay_packet import extract
from test_extract_archive_actor_packet import archive_fixture
from extract_archive_actor_packet import recorded_wrapper


def repeated_archive():
    archive = archive_fixture()
    evidence = archive['executionEvidence'][0]
    original = copy.deepcopy(evidence['content']['session']['events'])
    for offset in [100, 200]:
        events = copy.deepcopy(original)
        for event in events:
            event['seq'] += offset
        events[0]['data']['attempt'] += str(offset)
        events[0]['data']['context']['revision'] += offset
        events[2]['data']['attempt'] += str(offset)
        events[2]['data']['revision'] += offset
        events[2]['data']['commitId'] += str(offset)
        command = copy.deepcopy(archive['commits'][0])
        command['id'] += str(offset)
        command['revision'] += offset
        command['command']['expectedRevision'] += offset
        command['command']['principal']['attempt'] += str(offset)
        archive['commits'].append(command)
        evidence['content']['session']['events'].extend(events)
    return archive


class ExplicitSelection(unittest.TestCase):
    def test_full_session_and_exact_receipt_link_are_preserved(self):
        archive = repeated_archive()
        wrapper = recorded_wrapper(archive, 'sha', 'elia', 103, 109)
        self.assertEqual(wrapper['actorSession'], archive['executionEvidence'][0]['content']['session'])
        self.assertEqual(wrapper['originalCommit'], archive['commits'][3])
        self.assertEqual(wrapper['selection']['receiptSeq'], 120)

    def test_missing_coordinates_and_cross_request_header_fail(self):
        archive = repeated_archive()
        for coordinates in [(None, None), (103, None), (None, 109), (3, 109), (999, 109)]:
            with self.assertRaises(ValueError):
                recorded_wrapper(archive, 'sha', 'elia', *coordinates)

    def test_retry_header_requires_both_explicit_coordinates(self):
        archive = archive_fixture()
        events = archive['executionEvidence'][0]['content']['session']['events']
        retry = copy.deepcopy(events[1]); retry['seq'] = 10
        events.insert(2, retry)
        with self.assertRaises(ValueError):
            recorded_wrapper(archive, 'sha', 'elia')
        self.assertEqual(recorded_wrapper(archive, 'sha', 'elia', 3, 10)['selection']['requestHeaderSeq'], 10)

    def test_duplicate_seq_wrong_actor_instance_and_receipt_fail(self):
        for mutation in ['duplicate', 'actor', 'instance', 'receipt-duplicate', 'receipt-attempt', 'receipt-commit', 'receipt-revision']:
            archive = repeated_archive()
            events = archive['executionEvidence'][0]['content']['session']['events']
            if mutation == 'duplicate': events[4]['seq'] = events[3]['seq']
            elif mutation == 'actor': events[3]['data']['context']['actorId'] = 'wrong'
            elif mutation == 'instance': events[3]['data']['context']['instanceId'] = 'wrong'
            elif mutation == 'receipt-duplicate':
                duplicate = copy.deepcopy(events[5]); duplicate['seq'] = 121; events.insert(6, duplicate)
            else:
                key = {'receipt-attempt': 'attempt', 'receipt-commit': 'commitId', 'receipt-revision': 'revision'}[mutation]
                events[5]['data'][key] = 'wrong'
            with self.assertRaises(ValueError):
                recorded_wrapper(archive, 'sha', 'elia', 103, 109)

    def test_header_after_receipt_nonmonotonic_and_selection_conflict_fail(self):
        archive = repeated_archive()
        with self.assertRaises(ValueError):
            recorded_wrapper(archive, 'sha', 'elia', 103, 209)
        archive['executionEvidence'][0]['content']['session']['events'][4]['seq'] = 121
        with self.assertRaises(ValueError):
            recorded_wrapper(archive, 'sha', 'elia', 103, 121)
        wrapper = recorded_wrapper(repeated_archive(), 'sha', 'elia', 103, 109)
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'wrapper.json'; path.write_text(json.dumps(wrapper), encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'conflict'):
                extract(path, 203, 209)
            self.assertEqual(extract(path, 103, 109)['source']['receiptSeq'], 120)

    def test_direct_prepare_late_receipt_and_mixed_duplicate_commit_fail(self):
        archive = repeated_archive()
        duplicate = copy.deepcopy(archive['commits'][3]); duplicate['command']['principal']['actorId'] = 'wrong'
        archive['commits'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'globally unique'):
            recorded_wrapper(archive, 'sha', 'elia', 103, 109)
        wrapper = recorded_wrapper(repeated_archive(), 'sha', 'elia', 103, 109)
        events = wrapper['actorSession']['events']
        late = copy.deepcopy(events[4]); late['seq'] = 121; events.insert(6, late)
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'wrapper.json'
            plain = {'actorId': 'elia', 'actorSession': wrapper['actorSession']}
            path.write_text(json.dumps(plain), encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'receipt'):
                extract(path, 103, 121)
            wrapper['selection']['commitId'] = 'wrong'
            path.write_text(json.dumps(wrapper), encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'receipt/commit'):
                extract(path)


if __name__ == '__main__': unittest.main()
