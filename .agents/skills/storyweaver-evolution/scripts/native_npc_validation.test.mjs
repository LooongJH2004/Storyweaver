import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadNativeNpcValidator } from './native_npc_validation.mjs';

// The exported after-Actor archive retains the original running attempt in its commit prefix.
const configPath = process.env.DSH_NATIVE_VALIDATION_CONFIG;
if (!configPath) throw new Error('Prerequisite: set DSH_NATIVE_VALIDATION_CONFIG to the frozen native validator JSON config; original R31 submissions must be in DSH_NATIVE_VALIDATION_EVIDENCE_ROOT or beside that config');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const evidenceRoot = process.env.DSH_NATIVE_VALIDATION_EVIDENCE_ROOT ?? dirname(resolve(configPath));
const adapter = await loadNativeNpcValidator(config);
test('all four original R31 posture failures retain native schema diagnostics', () => {
  for (const sample of ['A1', 'B1', 'A2', 'B2']) {
    const input = JSON.parse(readFileSync(resolve(evidenceRoot, `r31-luna-${sample}-complete-arguments.json`)));
    const result = adapter.validate(input);
    assert.equal(result.valid, false);
    assert.equal(result.phase, 'schema');
    assert.equal(result.error.name, 'ToolArgsError');
    assert.match(result.error.message, /posture/);
    assert.equal(result.error.message, `invalid arguments: ${result.error.violations.join('; ')}`);
  }
});
test('native admitted turn creates only an unpublished plan and permits repeated isolated validation', () => {
  const args = { posture: 'waiting', behavior: [{ kind: 'speech', text: '嗯。' }] };
  for (let i = 0; i < 2; i++) {
    const result = adapter.validate(args);
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.publication, false);
    assert.ok(result.plan.events.length > 0);
  }
  assert.deepEqual(args, { posture: 'waiting', behavior: [{ kind: 'speech', text: '嗯。' }] });
});
test('schema-valid unknown person routing is rejected by native actor admission', () => {
  const result = adapter.validate({ posture: 'waiting', behavior: [{ kind: 'speech', text: '嗯。', to: ['not-visible'] }] });
  assert.equal(result.valid, false);
  assert.equal(result.phase, 'admission');
  assert.match(result.error.message, /reference|perspective|person|visible/i);
});
test('malformed raw arguments stay malformed', () => {
  const result = adapter.validate({ arguments: { posture: 'waiting', behavior: [] } });
  assert.equal(result.valid, false);
  assert.equal(result.phase, 'schema');
});
test('native evidence admission rejects unavailable source without coordinator correction', () => {
  const result = adapter.validate({ posture: 'waiting', behavior: [], knowledge_changes: [{ id: 'new-belief',
    expectedRevision: 0, text: '我觉得如此。', kind: 'belief', attitude: 'believed', acquisition: 'inferred',
    entityRefs: [], sourceRefs: ['not-visible-evidence'], status: 'active', reason: '当下判断' }] });
  assert.equal(result.valid, false);
  assert.equal(result.phase, 'admission');
  assert.match(result.error.message, /Source is unavailable/);
});
test('native state admission rejects a nonexistent field update', () => {
  const result = adapter.validate({ posture: 'waiting', behavior: [], state_changes: [{ fieldId: 'not-visible-field',
    expectedRevision: 1, value: 'changed', reason: '当下变化', sourceRefs: [] }] });
  assert.equal(result.valid, false);
  assert.equal(result.phase, 'admission');
  assert.match(result.error.message, /field|state/i);
});
test('native action admission returns an unpublished attempt rather than a delivered outcome', () => {
  const result = adapter.validate({ posture: 'waiting', behavior: [{ kind: 'action', attempt: '抬起手。', purpose: '示意', visibility: 'public', await_result: false }] });
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.publication, false);
  assert.ok(result.plan.events.length > 0);
});
