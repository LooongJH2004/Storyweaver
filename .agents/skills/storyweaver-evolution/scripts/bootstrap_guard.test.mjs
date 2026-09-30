import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapGuardCode } from './bootstrap_guard.mjs';

const packet = { actorId: 'ren', input: { system: '正文含 truncated', tools: [], historyMessages: [] } };
const completed = () => ({ exit_code: 0, output: JSON.stringify(packet) });
const guard = r => Function('r', bootstrapGuardCode())(r);

test('complete packet and body word truncated pass the generated guard', () => {
  assert.doesNotThrow(() => guard(completed()));
});
test('nonzero or absent original exit code is rejected', () => {
  assert.throws(() => guard({ ...completed(), exit_code: 1 }), /did not complete/);
  assert.throws(() => guard({ output: JSON.stringify(packet) }), /did not complete/);
});
test('running original session is rejected', () => {
  assert.throws(() => guard({ ...completed(), session_id: 12 }), /still running/);
});
test('truncated JSON and tool prefix packaging are rejected', () => {
  assert.throws(() => guard({ exit_code: 0, output: '{"actorId":' }), /complete JSON/);
  assert.throws(() => guard({ exit_code: 0, output: 'Warning: truncated output\n' + JSON.stringify(packet) }), /complete JSON/);
});
test('each missing required input field or incorrect basic type is rejected', () => {
  for (const key of ['system', 'tools', 'historyMessages']) {
    const missing = structuredClone(packet);
    delete missing.input[key];
    assert.throws(() => guard({ exit_code: 0, output: JSON.stringify(missing) }), /required Actor input/);
    const wrong = structuredClone(packet);
    wrong.input[key] = key === 'system' ? [] : {};
    assert.throws(() => guard({ exit_code: 0, output: JSON.stringify(wrong) }), /required Actor input/);
  }
});
