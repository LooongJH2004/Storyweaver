/** Offline NPC admission uses built runtime modules and never publishes the validated plan. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const fieldReference = id => `field-${hash(id).slice(0, 32)}`;

/**
 * Load the original artifact runtime, replay request history, and capture loaded module hashes.
 * @param config - runtimeRoot, archivePath, replayPath, packetPath and explicit original turnPolicy.
 * @returns isolated validate function and reproducible provenance; no story database is opened.
 */
export async function loadNativeNpcValidator(config) {
  const files = new Map();
  const hook = registerHooks({ load(url, context, next) {
    const result = next(url, context);
    if (url.startsWith('file:')) {
      const path = fileURLToPath(url);
      files.set(path, hash(readFileSync(path)));
    }
    return result;
  } });
  let core, tools;
  try {
    core = await import(pathToFileURL(resolve(config.runtimeRoot, 'packages/story/roleplay-core/lib/index.js')).href);
    tools = await import(pathToFileURL(resolve(config.runtimeRoot, 'packages/core/tools/lib/index.js')).href);
  } finally { hook.deregister(); }
  if (files.size === 0) throw new Error('Runtime modules were already cached; freeze in a fresh Node process');
  const archive = core.narrativeArchiveSchema.parse(read(config.archivePath));
  const report = read(config.replayPath), packet = read(config.packetPath);
  if (packet.source.sha256 !== hash(readFileSync(config.replayPath))) throw new Error('Packet replay SHA mismatch');
  const request = report.actorSession.events.find(e => e.seq === packet.source.executionRequestSeq);
  const header = report.actorSession.events.find(e => e.seq === packet.source.requestHeaderSeq);
  if (request?.type !== 'roleplay/execution-request' || header?.type !== 'request/header') throw new Error('Recorded request events missing');
  const context = request.data.context;
  if (context.actorId !== packet.actorId || context.actorId !== report.actorId) throw new Error('Actor identity mismatch');
  const originalInput = Object.fromEntries(['system', 'tools', 'historyMessages'].map(k => [k, header.data.header[k]]));
  if (!isDeepStrictEqual(originalInput, packet.input)) throw new Error('Validator requires original recorded packet; candidate input is frozen separately');
  const tool = packet.input.tools.find(t => t.name === 'npc_commit_turn');
  if (!tool) throw new Error('npc_commit_turn schema missing');
  const store = new core.MemoryRoleplayStore();
  store.transaction(tx => {
    tx.put(context.instanceId, 'history', 'initial', archive.initial);
    for (const commit of archive.commits) tx.put(context.instanceId, 'commits', commit.id, commit);
  });
  const snapshot = store.read(tx => core.replayIn(tx, context.instanceId, context.revision));
  store.close();
  const execution = snapshot.entities.find(e => e.key.collection === 'execution' && e.key.id === context.actorId)?.value;
  if (snapshot.instance.id !== context.instanceId || execution?.status !== 'running' || execution.attempt !== request.data.attempt) throw new Error('Request-time running attempt unavailable');
  const recordedScope = report.result?.command;
  if (!recordedScope || recordedScope.expectedRevision !== context.revision || recordedScope.instanceId !== context.instanceId || recordedScope.principal.attempt !== execution.attempt || recordedScope.principal.epoch !== execution.epoch) throw new Error('Report command does not match request execution');
  const provenance = {
    runtimeFiles: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
    inputFiles: Object.fromEntries(['archivePath', 'replayPath', 'packetPath'].map(k => [config[k], hash(readFileSync(config[k]))])),
    schemaSha256: hash(JSON.stringify(tool.parameters)), snapshotSha256: hash(JSON.stringify(snapshot)),
    actorId: context.actorId, revision: context.revision, attempt: execution.attempt, epoch: execution.epoch,
    turnPolicy: config.turnPolicy,
    sourceFiles: Object.fromEntries(['packages/story/roleplay-core/src/cognition.ts', 'packages/story/roleplay-core/src/prepare-turn.ts',
      'packages/core/tools/src/json-schema.ts', 'packages/core/tools/src/schema.ts',
      'packages/story/roleplay-services/tests/longform-performance.e2e.ts'].map(path => {
      const absolute = resolve(config.runtimeRoot, path);
      return [absolute, hash(readFileSync(absolute))];
    })),
    adapterSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    simulationClock: '2026-09-30T00:00:00.000Z',
    fieldReferenceAlgorithm: 'field- + first 32 hexadecimal SHA256 characters of field id',
    feedbackTransport: 'diagnostic transcript containing native Error.message and violations; private ToolRegistry error envelope is not reproduced',
  };
  return { provenance, validate(rawArgs) {
    let phase = 'schema', plan;
    const success = new Error('offline-admission-complete');
    try {
      const violations = tools.validateJsonSchemaValue(tool.parameters, rawArgs, '');
      if (violations.length) throw new tools.ToolArgsError(violations);
      phase = 'admission';
      const writer = { execute(command, handler) {
        if (command.expectedRevision !== snapshot.instance.revision) throw new Error('Unexpected offline revision');
        plan = handler(structuredClone(snapshot));
        throw success;
      } };
      const values = { id: randomUUID, now: () => '2026-09-30T00:00:00.000Z' };
      const cognition = new core.CognitionApplication(writer, values, { ...config.turnPolicy, fieldReference });
      cognition.submitTurn({ ...recordedScope, id: `offline:${randomUUID()}` }, structuredClone(rawArgs));
      throw new Error('Offline writer returned without sentinel');
    } catch (error) {
      if (error === success) return { valid: true, phase: 'admission', publication: false, plan };
      return { valid: false, phase, publication: false, error: { name: error.name, message: error.message,
        ...(error.code === undefined ? {} : { code: error.code }), ...(error.violations === undefined ? {} : { violations: error.violations }) } };
    }
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, configPath, manifestPath, argsPath, outputPath] = process.argv.slice(2);
  const adapter = await loadNativeNpcValidator(read(configPath));
  if (mode === 'freeze') writeFileSync(manifestPath, `${JSON.stringify(adapter.provenance, null, 2)}\n`, { flag: 'wx' });
  else if (mode === 'validate') {
    if (!isDeepStrictEqual(read(manifestPath), adapter.provenance)) throw new Error('Frozen native validator provenance changed');
    writeFileSync(outputPath, `${JSON.stringify(adapter.validate(read(argsPath)), null, 2)}\n`, { flag: 'wx' });
  } else throw new Error('Usage: freeze config manifest | validate config manifest args output');
}
