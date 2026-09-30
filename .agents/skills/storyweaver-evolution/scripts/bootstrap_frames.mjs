/** Split the exact tool output on code-point boundaries within a serialized envelope buffer. */
export function createFrameState(body, transportId, envelopeCodeUnits) {
  if (typeof body !== 'string' || !transportId || !Number.isInteger(envelopeCodeUnits) || envelopeCodeUnits < 1) throw new Error('transport invalid framing configuration');
  const frames = [];
  let start = 0;
  while (start < body.length) {
    let end = start;
    let payload = '';
    while (end < body.length) {
      const point = String.fromCodePoint(body.codePointAt(end));
      const candidate = { kind: 'frame', transportId, seq: frames.length, total: body.length, start, end: end + point.length, payload: payload + point, frameComplete: true };
      if (JSON.stringify(candidate).length > envelopeCodeUnits) break;
      payload += point;
      end += point.length;
    }
    if (end === start) throw new Error('transport envelope buffer cannot fit one code point');
    frames.push({ kind: 'frame', transportId, seq: frames.length, total: body.length, start, end, payload, frameComplete: true });
    start = end;
  }
  for (const frame of frames) frame.total = frames.length;
  return { version: 1, transportId, body, frames, cursor: 0, pending: null, acknowledged: 0, status: 'ready', envelopeCodeUnits };
}

/** Persist an ACK and one sender envelope before advancing serializable state. */
export async function nextFrame(state, ack, persist) {
  if (!state) throw new Error('transport state lost');
  if (state.status === 'done') throw new Error('transport already done');
  if (state.status === 'failed') throw new Error('transport stopped after failure');
  if (!Array.isArray(state.frames) || state.cursor !== state.acknowledged + (state.pending === null ? 0 : 1)) throw new Error('transport invalid sequence state');
  if (state.pending === null ? ack !== null : !ack || ack.transportId !== state.transportId || ack.seq !== state.pending) throw new Error('transport ACK sequence mismatch');
  if (state.pending !== null && state.frames[state.pending]?.frameComplete !== true) throw new Error('transport partial pending frame');
  const candidate = { ...state };
  try {
    if (candidate.pending !== null) {
      await persist('ack-' + candidate.pending, { kind: 'ack', transportId: candidate.transportId, seq: candidate.pending });
      candidate.acknowledged += 1;
      candidate.pending = null;
    }
    let envelope;
    if (candidate.cursor < candidate.frames.length) {
      envelope = candidate.frames[candidate.cursor];
      const previousEnd = candidate.cursor === 0 ? 0 : candidate.frames[candidate.cursor - 1].end;
      if (envelope.frameComplete !== true || envelope.transportId !== candidate.transportId || envelope.seq !== candidate.cursor || envelope.total !== candidate.frames.length || envelope.start !== previousEnd || envelope.end !== envelope.start + envelope.payload.length || candidate.body.slice(envelope.start, envelope.end) !== envelope.payload || JSON.stringify(envelope).length > candidate.envelopeCodeUnits) throw new Error('transport frame sequence or payload mismatch');
      await persist('frame-' + envelope.seq, envelope);
      candidate.pending = candidate.cursor;
      candidate.cursor += 1;
      candidate.status = 'pending';
    } else {
      if (candidate.acknowledged !== candidate.frames.length || candidate.frames.map(frame => frame.payload).join('') !== candidate.body || (candidate.frames.length && candidate.frames.at(-1).end !== candidate.body.length)) throw new Error('transport assembly or final ACK incomplete');
      envelope = { kind: 'done', transportId: candidate.transportId, total: candidate.frames.length, acknowledged: candidate.acknowledged, exactAssembly: true, publication: false };
      await persist('done', envelope);
      candidate.status = 'done';
    }
    Object.assign(state, candidate);
    return envelope;
  } catch {
    state.status = 'failed';
    throw new Error('transport frame persistence or sequence failure');
  }
}

/** Generate pure inline implementations for functions.exec without eval or retained closures. */
export function frameCode() {
  return { create: createFrameState.toString(), next: nextFrame.toString() };
}
