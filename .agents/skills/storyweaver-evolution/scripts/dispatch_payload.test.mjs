import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { messageSha256, verifyDispatchPayload, persistDispatchIntent } from './dispatch_payload.mjs';

const frozen = { task_name: 'opaque', model: 'gpt-6-sol', reasoning_effort: 'low', fork_turns: 'none',
  message: "读取 D:/workspace/opaque.json\n原文：她说‘稍等’。\\n" };

test('persist complete frozen payload and exact UTF-8 message hash exclusively', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dispatch-intent-'));
  try {
    const path = join(directory, 'intent.json');
    const record = persistDispatchIntent(path, frozen, structuredClone(frozen));
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).payload, frozen);
    assert.equal(record.messageSha256, createHash('sha256').update(Buffer.from(frozen.message, 'utf8')).digest('hex'));
    assert.equal(record.actualQueueAuthenticated, false);
    assert.throws(() => persistDispatchIntent(path, frozen, frozen), /EEXIST/);
  } finally {
    const target = realpathSync(directory);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith('dispatch-intent-'));
    rmSync(target, { recursive: true });
  }
});

test('reject altered character, doubled path, or any non-message field', () => {
  for (const proposed of [
    { ...frozen, message: frozen.message.replace('她', '他') },
    { ...frozen, message: frozen.message.replace('D:/workspace/', 'D:\\\\workspace\\\\') },
    { ...frozen, reasoning_effort: 'high' },
    { ...frozen, extra: true },
  ]) assert.throws(() => verifyDispatchPayload(frozen, proposed), /differs/);
  assert.equal(verifyDispatchPayload(frozen, structuredClone(frozen)), messageSha256(frozen.message));
});
