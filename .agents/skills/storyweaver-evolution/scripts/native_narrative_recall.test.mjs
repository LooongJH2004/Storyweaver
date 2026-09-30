/** Focused keyless native fixtures; short continuation budget belongs to tests only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { frozenRecallReader, loadNativeRecall } from './native_narrative_recall.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const adapter = await loadNativeRecall(config);
const core = await import(pathToFileURL(resolve(config.runtimeRoot, 'packages/story/roleplay-core/lib/index.js')));
const tools = await import(pathToFileURL(resolve(config.runtimeRoot, 'packages/core/tools/lib/index.js')));
let serial = 0, checks = 0;
const check = fn => { fn(); checks++; };
const book = { schemaVersion: 6, id: 'recall-test', title: 'Recall fixture', directorPrompt: '', protagonistActorId: null,
  characters: ['a', 'b'].map(actorId => ({ actorId, displayName: actorId, appearance: actorId, publicPersona: 'Independent person',
    rolePrompt: '', capabilities: ['speak', 'memory'], actingGuidance: {} })), directorGuidance: {}, commonKnowledge: [] };
const snapshot = { instance: { id: 'fixture', revision: 2, epoch: 0 },
  entities: core.initializeWorld({ document: book }, { id: () => `test-${++serial}`, now: () => '2026-09-30T00:00:00.000Z' }) };
const evidence = (actorId, id, content, revision) => ({ key: { collection: `evidence:${actorId}`, id },
  value: { id, recipient: actorId, content, kind: 'observation', sourceRefs: [], personRefs: [], revision } });
snapshot.entities.push(evidence('a', 'own', 'OWN 😀 original\r\n', 1), evidence('b', 'private', 'PRIVATE', 1));
const future = structuredClone(snapshot); future.instance.revision = 3; future.entities.push(evidence('a', 'future', 'FUTURE', 3));
const reader = frozenRecallReader(snapshot);
const directReader = { replay(instanceId, revision) { assert.equal(instanceId, 'fixture'); assert.equal(revision, 2); return structuredClone(snapshot); } };
const query = { instanceId: 'fixture', actorId: 'a', revision: 2 };
const native = new core.PerspectiveQueries(reader, 24000, id => id, 100);
const direct = new core.PerspectiveQueries(directReader, 24000, id => id, 100);
const args = { query: '', offset: 0, limit: 10 };
const before = JSON.stringify(snapshot);
check(() => assert.deepEqual(native.recall(query, args), direct.recall(query, args)));
check(() => { const result = JSON.parse(JSON.stringify(native.recall(query, args))); assert.equal(JSON.stringify(result), JSON.stringify(direct.recall(query, args))); assert.equal(result.total, 1); assert.equal(result.entries[0].id, 'own'); });
for (const term of ['private', 'future', 'missing']) check(() => assert.equal(native.recall(query, { ...args, query: term }).total, 0));
check(() => { const clone = reader.replay('fixture', 2); clone.entities.length = 0; assert.equal(reader.replay('fixture', 2).entities.length, snapshot.entities.length); });
check(() => assert.throws(() => reader.replay('foreign', 2), /mismatch/));
check(() => assert.throws(() => reader.replay('fixture', 3), /mismatch/));
check(() => assert.throws(() => reader.snapshot('fixture'), /exact frozen revision/));
check(() => { const snapshot3 = frozenRecallReader(future); assert.equal(new core.PerspectiveQueries(snapshot3, 24000, id => id, 100).recall({ ...query, revision: 3 }, { ...args, query: 'future' }).total, 1); });
const short = new core.PerspectiveQueries(reader, 3, id => id, 100);
check(() => {
  let current = { ...args, query: 'own' }, text = '', pages = 0;
  while (true) { const result = short.recall(query, current); text += result.entries[0].text; pages++;
    if (!result.continuation) { assert.equal(result.nextOffset, null); break; }
    assert.equal(result.entries[0].truncated, true); current = { ...current, ...result.continuation }; }
  assert.equal(text, direct.recall(query, { ...args, query: 'own' }).entries[0].text); assert.ok(pages > 1);
});
for (const bad of [{ ...args, owner: 'actor:b' }, { ...args, actorId: 'b' }, { ...args, offset: -1 },
  { ...args, limit: 0 }, { ...args, limit: 101 }, { ...args, characterOffset: -1 },
  { ...args, sourceId: '' }, { ...args, sourceId: 'wrong' }, { ...args, characterOffset: 999999 }]) {
  check(() => assert.throws(() => native.recall(query, bad)));
}
check(() => assert.equal(JSON.stringify(snapshot), before));
for (const key of ['actorId', 'instanceId', 'revision', 'attempt', 'epoch']) {
  check(() => { const scope = structuredClone(adapter.provenance.scope); scope[key] = key === 'revision' || key === 'epoch' ? 999 : 'foreign';
    const result = adapter.query({ query: 'certainly-missing-test-value', offset: 0, limit: 1 }, scope);
    assert.equal(result.ok, false); assert.match(result.error.message, /mismatch/); assert.equal(result.snapshotSha256Before, result.snapshotSha256After); });
}
check(() => { const bad = { query: 9, offset: 0, limit: 1 }; const packet = JSON.parse(readFileSync(config.packetPath));
  const schema = packet.input.tools.find(tool => tool.name === 'narrative_recall').parameters;
  const expected = new tools.ToolArgsError(tools.validateJsonSchemaValue(schema, bad, ''));
  const actual = adapter.query(bad); assert.equal(actual.ok, false); assert.deepEqual(actual.error, { name: expected.name, message: expected.message, code: expected.code, violations: expected.violations }); });
console.log(JSON.stringify({ checks, status: 'PASS', fixtureQueryPageLimit: 100, fixtureRecallCharacterLimit: 24000,
  continuationTestOnlyCharacterLimit: 3, publication: false }));
