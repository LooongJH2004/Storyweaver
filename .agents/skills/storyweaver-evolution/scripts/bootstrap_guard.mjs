/** Reject incomplete tool returns before the Actor body is emitted. */
export function guardBootstrapReturn(r) {
  if (r.exit_code !== 0) throw new Error('transport original process did not complete successfully');
  if (r.session_id != null) throw new Error('transport original process is still running');
  let packet;
  try { packet = JSON.parse(r.output); }
  catch { throw new Error('transport output is not one complete JSON packet'); }
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || typeof packet.actorId !== 'string'
      || !packet.input || typeof packet.input !== 'object' || Array.isArray(packet.input)
      || typeof packet.input.system !== 'string' || !Array.isArray(packet.input.tools)
      || !Array.isArray(packet.input.historyMessages)) {
    throw new Error('transport required Actor input fields are missing or have invalid types');
  }
}

/** Return the exact reusable guard source for a generated bootstrap execution. */
export function bootstrapGuardCode() {
  return '(' + guardBootstrapReturn.toString() + ')(r);';
}
