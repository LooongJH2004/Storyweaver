import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { durablePlan } from './durable_transport.mjs';
import { renderContextEnvelope, decodeContextFrames } from './context_units.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceNames = ['durable_transport.py', 'durable_transport.mjs', 'context_units.mjs', 'bootstrap_frames.mjs', 'bootstrap_guard.mjs'];
const value = { actorId: 'own', input: { system: '原文😀\n'.repeat(19000), tools: [{ name: 'recall', extra: '' }],
  historyMessages: [{ role: 'user', content: 'metadata\n`literal`' }], unknown: { empty: [], zero: 0, nil: null } } };

function fixture(directory, name) {
  const inputPath = join(directory, name + '-input.json'), configPath = join(directory, name + '-config.json');
  const raw = JSON.stringify(value); writeFileSync(inputPath, raw);
  const dependency = join(directory, name + '-dependency.txt'); writeFileSync(dependency, 'frozen');
  const sourceFiles = Object.fromEntries(sourceNames.map(n => [join(scripts, n), digest(readFileSync(join(scripts, n)))]));
  sourceFiles[dependency] = digest(readFileSync(dependency));
  const config = { owner: name, transportId: name, captureDirectory: join(directory, name + '-capture'), inputPath,
    inputSha256: digest(Buffer.from(raw)), planSha256: digest(JSON.stringify(durablePlan(raw, name))),
    runnerPath: join(scripts, 'durable_transport.mjs'), sourceFiles, nextCodeTemplate: 'fixed-__CONFIG_SHA256__' };
  writeFileSync(configPath, JSON.stringify(config));
  const configSha256 = digest(readFileSync(configPath));
  const call = (operation, owner = name) => spawnSync('python', [join(scripts, 'durable_transport.py'), configPath,
    configSha256, sourceFiles[join(scripts, 'durable_transport.py')], operation, owner], { encoding: 'utf8' });
  return { config, configPath, call, inputPath, dependency };
}

function cleanup(directory) {
  const target = realpathSync(directory);
  assert.equal(dirname(target), realpathSync(tmpdir()));
  assert.ok(basename(target).startsWith('durable-transport-'));
  rmSync(target, { recursive: true });
}

test('fresh processes preserve every original frame and final invocation ACK without source reread or cache', () => {
  const directory = mkdtempSync(join(tmpdir(), 'durable-transport-'));
  try {
    const f = fixture(directory, 'A');
    assert.equal(f.call('bootstrap').status, 0);
    unlinkSync(f.inputPath);
    const expected = durablePlan(JSON.stringify(value), 'A').state.frames;
    assert.ok(expected.length > 27);
    for (let index = 0; index <= expected.length; index++) {
      const result = f.call('next'); assert.equal(result.status, 0, result.stderr);
      const receipt = JSON.parse(result.stdout);
      if (index < expected.length) assert.equal(receipt.body, renderContextEnvelope(expected[index]));
      else assert.equal(JSON.parse(receipt.body).acknowledged, expected.length);
    }
    assert.deepEqual(decodeContextFrames(expected), value);
    const last = JSON.parse(readFileSync(join(f.config.captureDirectory, `step-${expected.length}.json`)));
    assert.equal(last.events[0].name, `ack-${expected.length - 1}`);
    assert.equal(last.events[1].name, 'done');
    assert.notEqual(f.call('next').status, 0);
    assert.notEqual(f.call('bootstrap').status, 0);
  } finally { cleanup(directory); }
});

test('source, immutable plan, partial checkpoint and orphan claim failures permanently stop output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'durable-transport-'));
  try {
    const untrusted = fixture(directory, 'config');
    const wrongDirectory = join(directory, 'untrusted-path');
    writeFileSync(untrusted.configPath, JSON.stringify({ ...untrusted.config, captureDirectory: wrongDirectory }));
    assert.notEqual(untrusted.call('bootstrap').status, 0);
    assert.equal(existsSync(wrongDirectory), false);
    assert.equal(existsSync(untrusted.config.captureDirectory), false);
    for (const mode of ['source', 'plan', 'partial', 'claim']) {
      const f = fixture(directory, mode); assert.equal(f.call('bootstrap').status, 0);
      if (mode === 'source') writeFileSync(f.dependency, 'changed');
      if (mode === 'plan') writeFileSync(join(f.config.captureDirectory, 'plan.json'), '{}');
      if (mode === 'partial') writeFileSync(join(f.config.captureDirectory, 'step-0.json'), '{');
      if (mode === 'claim') writeFileSync(join(f.config.captureDirectory, 'active-claim.json'), '{}');
      const failed = f.call('next'); assert.notEqual(failed.status, 0); assert.equal(failed.stdout, '');
      assert.notEqual(f.call('next').status, 0);
      assert.equal(readdirSync(f.config.captureDirectory).filter(n => /^step-/.test(n)).length, mode === 'partial' ? 1 : 0);
    }
  } finally { cleanup(directory); }
});

test('two owners remain isolated while successful invocations interleave', () => {
  const directory = mkdtempSync(join(tmpdir(), 'durable-transport-'));
  try {
    const a = fixture(directory, 'ownerA'), b = fixture(directory, 'ownerB');
    assert.equal(a.call('bootstrap').status, 0); assert.equal(b.call('bootstrap').status, 0);
    const denied = b.call('next', 'ownerA'); assert.notEqual(denied.status, 0); assert.equal(denied.stdout, '');
    assert.ok(!denied.stderr.includes(value.input.system));
    for (const f of [a, b, a, b]) {
      const result = f.call('next'); assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).owner, f.config.owner);
    }
  } finally { cleanup(directory); }
});
