/** Frozen offline narrative recall; no writer, database, publication, or live attempt lease. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const digest = snapshot => hash(JSON.stringify(snapshot));
const nativeError = error => ({ name: error.name, message: error.message,
  ...(error.code === undefined ? {} : { code: error.code }),
  ...(error.violations === undefined ? {} : { violations: error.violations }) });

/**
 * Construct a clone-only reader at one authenticated instance and revision.
 * @param snapshot - Detached request-time native snapshot.
 * @returns Native reader rejecting current-state and foreign revision reads.
 */
export function frozenRecallReader(snapshot) {
  const frozen = structuredClone(snapshot);
  return { snapshot() { throw new Error('Recall requires the exact frozen revision'); },
    replay(instanceId, revision) {
      if (instanceId !== frozen.instance.id || revision !== frozen.instance.revision) throw new Error('Recall instance/revision mismatch');
      return structuredClone(frozen);
    } };
}

/**
 * Bind original recorded request, running attempt and original recall schema in a fresh process.
 * @param config - Original archive/replay/packet paths, runtimeRoot, and explicit fixture query budgets.
 * @returns Frozen provenance and query function; no mutable store survives initialization.
 */
export async function loadNativeRecall(config) {
  if (![config.queryPageLimit, config.recallCharacterLimit].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Recall query settings must be explicit positive safe integers');
  const files = new Map();
  const hook = registerHooks({ load(url, context, next) {
    const result = next(url, context);
    if (url.startsWith('file:')) files.set(fileURLToPath(url), hash(readFileSync(fileURLToPath(url))));
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
  const request = report.actorSession.events.find(event => event.seq === packet.source.executionRequestSeq);
  const header = report.actorSession.events.find(event => event.seq === packet.source.requestHeaderSeq);
  if (request?.type !== 'roleplay/execution-request' || header?.type !== 'request/header') throw new Error('Recorded request events missing');
  const context = request.data.context;
  if (context.actorId !== packet.actorId || context.actorId !== report.actorId) throw new Error('Actor identity mismatch');
  const originalInput = Object.fromEntries(['system', 'tools', 'historyMessages'].map(key => [key, header.data.header[key]]));
  if (!isDeepStrictEqual(originalInput, packet.input)) throw new Error('Recall requires original recorded packet');
  const tool = packet.input.tools.find(value => value.name === 'narrative_recall');
  if (!tool) throw new Error('Original narrative_recall schema missing');
  const store = new core.MemoryRoleplayStore();
  let snapshot;
  try {
    store.transaction(tx => {
      tx.put(context.instanceId, 'history', 'initial', archive.initial);
      for (const commit of archive.commits) tx.put(context.instanceId, 'commits', commit.id, commit);
    });
    snapshot = store.read(tx => core.replayIn(tx, context.instanceId, context.revision));
  } finally { store.close(); }
  const execution = snapshot.entities.find(value => value.key.collection === 'execution' && value.key.id === context.actorId)?.value;
  if (snapshot.instance.id !== context.instanceId || snapshot.instance.revision !== context.revision
    || execution?.status !== 'running' || execution.attempt !== request.data.attempt
    || execution.epoch !== snapshot.instance.epoch) throw new Error('Request-time running attempt unavailable');
  const command = report.result?.command;
  if (!command || command.expectedRevision !== context.revision || command.instanceId !== context.instanceId
    || command.principal.actorId !== context.actorId || command.principal.attempt !== execution.attempt
    || command.principal.epoch !== execution.epoch) throw new Error('Report scope does not match request execution');
  const scope = { actorId: context.actorId, instanceId: context.instanceId, revision: context.revision,
    attempt: execution.attempt, epoch: execution.epoch };
  const sourcePaths = ['packages/story/roleplay-core/src/perspective.ts', 'packages/story/roleplay-core/src/retention.ts',
    'packages/story/roleplay-core/src/retention-records.ts', 'packages/story/roleplay-core/src/command-inputs.ts',
    'packages/story/roleplay-core/src/runtime.ts', 'packages/story/roleplay-core/src/memory-store.ts',
    'packages/story/roleplay-core/src/commands.ts', 'packages/core/tools/src/json-schema.ts',
    'packages/core/tools/src/schema.ts', 'packages/experimental/actor/src/narrative-executor.ts',
    'packages/story/roleplay-services/tests/longform-performance.e2e.ts'];
  const provenance = {
    runtimeFiles: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
    sourceFiles: Object.fromEntries(sourcePaths.map(path => { const absolute = resolve(config.runtimeRoot, path); return [absolute, hash(readFileSync(absolute))]; })),
    inputFiles: Object.fromEntries(['archivePath', 'replayPath', 'packetPath'].map(key => [config[key], hash(readFileSync(config[key]))])),
    configSha256: hash(JSON.stringify(config)), adapterSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    schemaSha256: hash(JSON.stringify(tool.parameters)), snapshotSha256: digest(snapshot), scope,
    requestSeq: request.seq, headerSeq: header.seq,
    queryPageLimit: config.queryPageLimit, recallCharacterLimit: config.recallCharacterLimit,
    settingsAuthority: config.settingsAuthority ?? 'Explicit host query configuration; archived producer/effective historical settings unproven',
    attemptAuthority: 'Original recorded execution request and replayed running execution; offline scope guard, no live production lease',
    rendering: 'Native narrative-executor JSON clone then JSON.stringify(value); host tool-result-equivalent transcript, no ToolRegistry envelope claim',
    publication: false,
  };
  const queryEngine = new core.PerspectiveQueries(frozenRecallReader(snapshot), config.recallCharacterLimit,
    id => `field-${hash(id).slice(0, 32)}`, config.queryPageLimit);
  return { provenance, query(rawArgs, boundScope = scope) {
    const before = digest(snapshot);
    let outcome;
    try {
      if (!isDeepStrictEqual(boundScope, scope)) throw new Error('Recall actor/instance/revision/attempt/epoch mismatch');
      if (execution.status !== 'running' || execution.attempt !== scope.attempt || execution.epoch !== snapshot.instance.epoch) throw new Error('Recall frozen execution is stale');
      const violations = tools.validateJsonSchemaValue(tool.parameters, rawArgs, '');
      if (violations.length) throw new tools.ToolArgsError(violations);
      const result = JSON.parse(JSON.stringify(queryEngine.recall({ instanceId: scope.instanceId,
        actorId: scope.actorId, revision: scope.revision }, structuredClone(rawArgs))));
      outcome = { ok: true, result, renderedText: JSON.stringify(result) };
    } catch (error) { outcome = { ok: false, error: nativeError(error) }; }
    const after = digest(snapshot);
    if (before !== after || before !== provenance.snapshotSha256) throw new Error('Recall snapshot changed');
    return { ...outcome, publication: false, snapshotSha256Before: before, snapshotSha256After: after };
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, configPath, manifestPath, argsPath, outputDirectory] = process.argv.slice(2);
  const adapter = await loadNativeRecall(read(configPath));
  if (mode === 'freeze') { save(manifestPath, adapter.provenance); console.log(JSON.stringify({ mode, manifestPath })); }
  else if (mode === 'query') {
    if (!isDeepStrictEqual(read(manifestPath), adapter.provenance)) throw new Error('Frozen native recall provenance changed');
    const argsBytes = readFileSync(argsPath);
    const outcome = adapter.query(JSON.parse(argsBytes.toString('utf8')));
    save(resolve(outputDirectory, 'outcome.json'), outcome);
    if (outcome.ok) {
      save(resolve(outputDirectory, 'result.json'), outcome.result);
      writeFileSync(resolve(outputDirectory, 'rendered.txt'), outcome.renderedText, { flag: 'wx' });
    } else save(resolve(outputDirectory, 'error.json'), outcome.error);
    save(resolve(outputDirectory, 'provenance.json'), { ...adapter.provenance, argsPath, argsSha256: hash(argsBytes),
      resultSha256: outcome.ok ? hash(JSON.stringify(outcome.result)) : null,
      renderedTextSha256: outcome.ok ? hash(outcome.renderedText) : null });
    console.log(JSON.stringify({ ok: outcome.ok, outputDirectory, publication: false }));
  } else throw new Error('Usage: freeze config manifest | query config manifest args output-directory');
}
