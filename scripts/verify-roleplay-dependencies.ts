/** Enforce narrative-domain imports and the Actor's declared narrative access. */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const domain = new Set(['outline-model.ts', 'outline-rules.ts', 'settings.ts', 'command-inputs.ts', 'behavior.ts', 'world-validation.ts', 'discussion-model.ts', 'discussion-rules.ts', 'roleplay-error.ts', 'types.ts', 'records.ts', 'characters.ts', 'knowledge.ts', 'dynamic-state.ts', 'style.ts',
  'storybook.ts', 'storybook-defaults.ts', 'context-retention.ts', 'context-recipe.ts', 'retention-records.ts', 'actor-model.ts', 'actor-events.ts', 'actor-state.ts', 'actor-continuity.ts', 'world.ts'])

/** Validate a source module without loading its runtime dependencies. */
export function inspectRoleplayDependencies(path: string, content: string): string[] {
  const failures: string[] = []
  const normalized = path.replaceAll('\\', '/')
  const core = normalized.includes('/roleplay-core/src/') && !normalized.endsWith('/invariant.ts')
  const actor = normalized.includes('/experimental/actor/src/')
  const entry = normalized.includes('/api/roleplay-controller/src/')
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true)
  const check = (specifier: string): void => {
    if (core && !specifier.startsWith('.') && specifier !== 'zod' && specifier !== '@deepseek-ai/dsh-brand') {
      failures.push(`Narrative core cannot import ${specifier}`)
    }
    if (core && domain.has(basename(path)) && specifier.startsWith('.') && !domain.has(basename(specifier))) {
      failures.push(`Domain rules cannot depend on application module ${specifier}`)
    }
    if (entry && (specifier.startsWith('node:') || /^@deepseek-ai\/dsh-(?:agent|session|story|storage)(?:$|[-/])/u.test(specifier))) {
      failures.push(`Independent RPC cannot depend on execution, legacy Story or storage: ${specifier}`)
    }
    if (actor && specifier.startsWith('@deepseek-ai/dsh-story')) failures.push('Actor must obtain narrative data through ActorNarrativeReader')
  }
  const visit = (node: ts.Node): void => {
    if (entry && ts.isIndexedAccessTypeNode(node) && ts.isTypeReferenceNode(node.objectType)
      && ts.isIdentifier(node.objectType.typeName) && node.objectType.typeName.text === 'Context') {
      failures.push('RPC payloads must use public data contracts, not host Context service signatures')
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) check(node.argument.literal.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const argument = node.arguments[0]
      if (argument !== undefined && ts.isStringLiteral(argument)) check(argument.text)
      else if (core) failures.push('Narrative core cannot use computed runtime imports')
    }
    if (actor && ts.isStringLiteral(node) && node.text === 'storyRegistry') failures.push('Actor cannot reverse-query the Story registry')
    if (core && ts.isStringLiteral(node) && /^(actor\/|turn\/|agent\/)/u.test(node.text)) failures.push('Execution event classification belongs to a Harness adapter')
    if (core && ts.isIdentifier(node) && ['process', 'Buffer', 'fetch', 'window', 'document'].includes(node.text)
      && !ts.isPropertyAccessExpression(node.parent) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      && !(ts.isPropertySignature(node.parent) && node.parent.name === node)
      && !(ts.isParameter(node.parent) && node.parent.name === node)) {
      if (node.text !== 'document') failures.push(`Narrative core cannot access ambient ${node.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...new Set(failures)]
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sourceFiles(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
}

function run(): void {
  const failures: string[] = []
  for (const directory of ['packages/story/roleplay-core/src', 'packages/experimental/actor/src', 'packages/api/roleplay-controller/src']) {
    for (const file of sourceFiles(resolve(root, directory))) {
      if (!file.endsWith('.ts')) continue
      const path = resolve(root, directory, file)
      failures.push(...inspectRoleplayDependencies(path, readFileSync(path, 'utf8')).map(issue => `${relative(root, path)}: ${issue}`))
    }
  }
  if (failures.length > 0) { process.stderr.write(failures.join('\n') + '\n'); process.exitCode = 1 }
  else process.stdout.write('Roleplay domain and Actor narrative dependencies verified.\n')
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
