"""Frozen code selection remains independent from role data and round prefixes."""
import json,pathlib,unittest
from prepare_cached_transport import cached_control
from transport_control import load_control
import tempfile

class CachedTransport(unittest.TestCase):
    def test_r40_prefix_uses_real_frozen_control_only(self):
        repo=pathlib.Path('/synthetic')
        handler='const K="r38-oldid";const audit="/synthetic/r38-capture-oldid";text("fixed-frame");'
        ready={'kind':'ready','nextCode':handler}
        template={'storeKey':'r38-oldid','nextCode':handler,'bootstrapCode':
            'const K="r38-oldid";const inputPath="/synthetic/r38-input-oldid.json";'
            'const capturePath="/synthetic/r38-capture-oldid";const ready='+json.dumps(ready)+';text(ready);'}
        code=cached_control(template,'r40-newid',repo/'r40-input-newid.json',repo/'r40-capture-newid')
        self.assertIn('r40-input-newid.json',code['controlSource'])
        self.assertIn('r40-capture-newid',code['handlerSource'])
        self.assertNotIn('r39-',code['controlSource'])
        self.assertNotIn('r38-',code['controlSource'])
        self.assertIn('r40-newid-handler',code['nextCode'])
        self.assertNotIn('historyMessages',code['handlerSource'])

    def test_control_digest_and_kind_reject_invalid_records(self):
        with tempfile.TemporaryDirectory() as directory:
            p=pathlib.Path(directory)/'record.json'
            p.write_text(json.dumps({'kind':'wrong','source':'text("ready")'}),encoding='utf8')
            with self.assertRaises(ValueError):load_control(p,'wrong')
            p.write_text(json.dumps({'kind':'frozen-transport-control','source':'text("ready")','sourceSha256':'wrong'}),encoding='utf8')
            with self.assertRaises(ValueError):load_control(p,'wrong')

if __name__=='__main__':unittest.main()
