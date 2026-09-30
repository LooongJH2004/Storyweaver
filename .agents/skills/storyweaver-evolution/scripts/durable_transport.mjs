import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createContextState, decodeContextFrames, renderContextEnvelope } from './context_units.mjs';
import { nextFrame } from './bootstrap_frames.mjs';
import { guardBootstrapReturn } from './bootstrap_guard.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => JSON.stringify(value);
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sequence = state => Object.fromEntries(['cursor', 'pending', 'acknowledged', 'status'].map(key => [key, state[key]]));

/** Derive the unchanged typed-field plan; the guard checks data fields, not a real exec return. */
export function durablePlan(raw, transportId) {
  guardBootstrapReturn({ exit_code: 0, output: raw });
  const value = JSON.parse(raw);
  const state = createContextState(value, transportId, 3000);
  if (encoded(decodeContextFrames(state.frames)) !== encoded(value)) throw Error('transport full-value mismatch');
  return { state, semanticJson: encoded(value), rawSha256: sha(Buffer.from(raw, 'utf8')) };
}

function writeNew(path, value) {
  const fd = openSync(path, 'wx');
  try { writeFileSync(fd, encoded(value)); fsyncSync(fd); } finally { closeSync(fd); }
}

function contained(directory, name) {
  const path = resolve(directory, name);
  if (dirname(path) !== realpathSync(directory) || existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('transport file path rejected');
  return path;
}

function failure(directory) {
  if (existsSync(directory) && !existsSync(join(directory, 'failed.json'))) writeNew(join(directory, 'failed.json'), { status: 'failed' });
}

function verifyHostReturn(directory, config, generation, body) {
  const prefix = `host-${generation}`;
  const record = read(contained(directory, prefix + '.json'));
  const stdout = readFileSync(contained(directory, prefix + '.stdout.bin'));
  const stderr = readFileSync(contained(directory, prefix + '.stderr.bin'));
  if (record.exitCode !== 0 || stderr.length || record.stdoutSha256 !== sha(stdout) || record.stderrSha256 !== sha(stderr)
    || !isDeepStrictEqual(JSON.parse(stdout), { transportId: config.transportId, owner: config.owner, sequence: generation, body })) {
    throw Error('transport host return incomplete');
  }
}

async function advance(plan, current) {
  const state = { ...plan.state, ...current };
  const events = [];
  if (encoded(decodeContextFrames(state.frames)) !== plan.semanticJson) throw Error('transport full-value mismatch');
  const envelope = await nextFrame(state, state.pending === null ? null : { transportId: state.transportId, seq: state.pending },
    async (name, value) => { events.push({ name, value }); });
  return { newState: sequence(state), events, envelope, body: renderContextEnvelope(envelope) };
}

/** Advance one fixed invocation ACK transaction; failed or orphaned sessions never recover. */
export async function runDurable(config, operation, owner, configSha256) {
  if (owner !== config.owner) throw Error('transport owner rejected');
  const directory = resolve(config.captureDirectory);
  try {
    if (operation === 'bootstrap') {
      mkdirSync(directory);
      if (realpathSync(directory) !== directory) throw Error('transport directory link rejected');
      writeNew(contained(directory, 'started.json'), { transportId: config.transportId, owner, version: 1,
        captureAlgorithm: 'one Node fs.readFileSync, strict UTF-8 decode', expectedRawSha256: config.inputSha256 });
      const bytes = readFileSync(config.inputPath);
      if (sha(bytes) !== config.inputSha256) throw Error('transport original source changed');
      const fd = openSync(contained(directory, 'original-capture.bin'), 'wx');
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      writeNew(contained(directory, 'capture.json'), { algorithm: 'one Node fs.readFileSync', bytes: bytes.length, rawSha256: sha(bytes) });
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const plan = durablePlan(raw, config.transportId);
      if (sha(encoded(plan)) !== config.planSha256) throw Error('transport frozen plan mismatch');
      writeNew(contained(directory, 'plan.json'), plan);
      const ready = { kind: 'ready', transportId: config.transportId, total: plan.state.frames.length,
        nextCode: config.nextCodeTemplate.replace('__CONFIG_SHA256__', configSha256), viewMode: 'typed-fields', publication: false };
      writeNew(contained(directory, 'ready.json'), ready);
      return { transportId: config.transportId, owner, sequence: 'bootstrap', body: encoded(ready) };
    }
    if (operation !== 'next' || !existsSync(directory) || realpathSync(directory) !== directory) throw Error('transport operation rejected');
    if (existsSync(contained(directory, 'failed.json'))) throw Error('transport stopped after failure');
    const active = contained(directory, 'active-claim.json');
    writeNew(active, { transportId: config.transportId, owner });
    const started = read(contained(directory, 'started.json'));
    if (started.transportId !== config.transportId || started.owner !== owner) throw Error('transport identity rejected');
    const planBytes = readFileSync(contained(directory, 'plan.json'));
    if (sha(planBytes) !== config.planSha256) throw Error('transport plan changed');
    const plan = JSON.parse(planBytes);
    const ready = { kind: 'ready', transportId: config.transportId, total: plan.state.frames.length,
      nextCode: config.nextCodeTemplate.replace('__CONFIG_SHA256__', configSha256), viewMode: 'typed-fields', publication: false };
    if (!isDeepStrictEqual(read(contained(directory, 'ready.json')), ready)) throw Error('transport ready changed');
    verifyHostReturn(directory, config, 'bootstrap', encoded(ready));
    let current = sequence(plan.state), previousSha256 = config.planSha256, count = 0;
    const names = readdirSync(directory);
    const claims = names.filter(name => /^claim-/.test(name));
    const steps = names.filter(name => /^step-/.test(name));
    if (claims.length !== steps.length) throw Error('transport orphan claim');
    for (; count < steps.length; count++) {
      const claim = read(contained(directory, `claim-${count}.json`));
      if (!isDeepStrictEqual(claim, { transportId: config.transportId, owner, generation: count, previousSha256 })) throw Error('transport claim changed');
      const path = contained(directory, `step-${count}.json`), bytes = readFileSync(path), actual = JSON.parse(bytes);
      const expected = { transportId: config.transportId, owner, generation: count, previousSha256, oldState: current, ...await advance(plan, current) };
      if (!isDeepStrictEqual(actual, expected)) throw Error('transport checkpoint changed');
      verifyHostReturn(directory, config, count, actual.body);
      current = actual.newState; previousSha256 = sha(bytes);
    }
    if (steps.some(name => !/^step-\d+\.json$/.test(name)) || claims.some(name => !/^claim-\d+\.json$/.test(name))) throw Error('transport partial checkpoint');
    if (current.status === 'done') throw Error('transport already done');
    const oldState = current;
    writeNew(contained(directory, `claim-${count}.json`), { transportId: config.transportId, owner, generation: count, previousSha256 });
    const result = await advance(plan, current);
    writeNew(contained(directory, `step-${count}.json`), { transportId: config.transportId, owner, generation: count, previousSha256, oldState, ...result });
    unlinkSync(active);
    return { transportId: config.transportId, owner, sequence: count, body: result.body };
  } catch (error) { failure(directory); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [configPath, expectedSha256, operation, owner] = process.argv.slice(2);
    const bytes = readFileSync(configPath);
    if (sha(bytes) !== expectedSha256) throw Error('transport config changed');
    process.stdout.write(encoded(await runDurable(JSON.parse(bytes), operation, owner, expectedSha256)));
  } catch (error) { process.stderr.write(String(error.message)); process.exitCode = 1; }
}
