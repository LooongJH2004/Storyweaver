import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameState, nextFrame, frameCode } from './bootstrap_frames.mjs';
const ack = state => state.pending === null ? null : { transportId: state.transportId, seq: state.pending };
const save = async () => {};

test('exact Unicode/CRLF/escaped envelope assembly with configured buffer and no total cap', async () => {
  for (const body of ['', 'a', '中文😀\r\n"\\\x00truncated'.repeat(500), 'x'.repeat(3000)]) {
    const state = createFrameState(body, 'opaque', 3000); const emitted = [];
    while (state.status !== 'done') {
      const envelope = await nextFrame(state, ack(state), save);
      if (envelope.kind === 'frame') {
        assert.ok(JSON.stringify(envelope).length <= 3000);
        assert.ok(!/[\uD800-\uDBFF]$/.test(envelope.payload));
        assert.ok(!/^[\uDC00-\uDFFF]/.test(envelope.payload));
        emitted.push(envelope.payload);
      }
    }
    assert.equal(emitted.join(''), body);
    assert.equal(state.acknowledged, state.frames.length);
  }
  assert.throws(() => createFrameState('😀', 'id', 1), /cannot fit/);
});
test('last frame requires an additional ACK call before done; stale/skipped ACK rejected', async () => {
  const state = createFrameState('body', 'id', 3000);
  assert.equal((await nextFrame(state, null, save)).kind, 'frame');
  assert.equal(state.status, 'pending');
  await assert.rejects(nextFrame(state, null, save), /ACK/);
  await assert.rejects(nextFrame(state, { transportId: 'id', seq: 1 }, save), /ACK/);
  await assert.rejects(nextFrame(state, { transportId: 'wrong', seq: 0 }, save), /ACK/);
  assert.equal((await nextFrame(state, ack(state), save)).kind, 'done');
  await assert.rejects(nextFrame(state, ack(state), save), /already done/);
});
test('missing state, duplicate/skipped frame and persistence failure never advance or emit done', async () => {
  await assert.rejects(nextFrame(null, null, save), /state lost/);
  for (const mutate of [s => { s.frames[0].seq = 1; }, s => { s.frames[0].start = 1; }]) {
    const state = createFrameState('body', 'id', 3000); mutate(state);
    await assert.rejects(nextFrame(state, null, save), /failure/);
    assert.equal(state.cursor, 0); assert.equal(state.status, 'failed');
  }
  for (const failingStage of ['frame-0', 'ack-0', 'done']) {
    const state = createFrameState('body', 'id', 3000);
    const persist = async name => { if (name === failingStage) throw Error('disk failure'); };
    if (failingStage !== 'frame-0') await nextFrame(state, null, persist);
    const before = { cursor: state.cursor, acknowledged: state.acknowledged, pending: state.pending };
    await assert.rejects(nextFrame(state, ack(state), persist), /failure/);
    assert.deepEqual({ cursor: state.cursor, acknowledged: state.acknowledged, pending: state.pending }, before);
    assert.equal(state.status, 'failed');
  }
});
test('inline functions have the same behavior without a retained closure', async () => {
  const code = frameCode();
  const state = Function('return (' + code.create + ')("中文😀", "id", 3000)')();
  assert.equal(state.body, '中文😀');
  const next = Function('return (' + code.next + ')')();
  const frame = await next(state, null, save);
  assert.equal(frame.payload, state.body);
  assert.equal((await next(state, ack(state), save)).kind, 'done');
  assert.equal(state.frames.map(f => f.payload).join(''), state.body);
});
