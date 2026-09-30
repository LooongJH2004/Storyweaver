import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { writeFileSync } from 'node:fs';

/** Hash the exact UTF-8 message proposed for a collaboration call. */
export function messageSha256(message) {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

/** Reject any field or message-byte change before recording a proposed call. */
export function verifyDispatchPayload(frozen, proposed) {
  if (!isDeepStrictEqual(frozen, proposed) || messageSha256(frozen.message) !== messageSha256(proposed.message)) {
    throw new Error('Queued payload differs from frozen payload');
  }
  return messageSha256(proposed.message);
}

/** Exclusively persist checked intent; this does not authenticate platform queue bytes. */
export function persistDispatchIntent(path, frozen, proposed) {
  const messageSha256Value = verifyDispatchPayload(frozen, proposed);
  const record = { kind: 'checked-dispatch-intent', payload: proposed, messageSha256: messageSha256Value,
    actualQueueAuthenticated: false, finalManualCopyUncertainty: true };
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return record;
}
