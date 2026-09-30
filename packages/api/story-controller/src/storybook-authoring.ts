import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  DEFAULT_STORYBOOK_CONTEXT_RULES,
  DEFAULT_STORYBOOK_DISCUSSION_SETTINGS,
  DEFAULT_STORYBOOK_REASONING_LANGUAGE,
  parseStorybookDocument,
  type StorybookDocument,
} from '@deepseek-ai/dsh-story'
import type { StorybookAuthoringValue } from './types.ts'

/** A browser save targeted an older storybook revision. */
export class StorybookRevisionError extends Error {
  /** @param expected - Browser revision. @param actual - Current durable revision. */
  constructor(readonly expected: string, readonly actual: string) {
    super(`Storybook revision changed from '${expected}' to '${actual}'`)
    this.name = 'StorybookRevisionError'
  }
}

/**
 * Read canonical player-editable storybook JSON without exposing its path.
 * @param path - Managed storybook path.
 * @param fallback - Initial document returned while the file is absent.
 * @returns normalized JSON and a content revision.
 */
export async function readStorybookAuthoring(
  path: string,
  fallback: StorybookDocument,
): Promise<StorybookAuthoringValue> {
  let source: string
  let exists = true
  try {
    source = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (!isMissing(error)) throw error
    source = JSON.stringify(fallback)
    exists = false
  }
  return authoringValue(parseSource(source), exists)
}

/**
 * Atomically replace one storybook after validating its exact prior revision.
 * @param path - Managed storybook path.
 * @param fallback - Initial document used when the file is absent.
 * @param expectedRevision - Revision returned by the last read.
 * @param source - Complete replacement JSON.
 * @returns canonical saved JSON and its new revision.
 */
export async function writeStorybookAuthoring(
  path: string,
  fallback: StorybookDocument,
  expectedRevision: string,
  source: string,
): Promise<StorybookAuthoringValue> {
  const current = await readStorybookAuthoring(path, fallback)
  if (current.revision !== expectedRevision) {
    throw new StorybookRevisionError(expectedRevision, current.revision)
  }
  const next = authoringValue(parseSource(source), true)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, next.storybookJson, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } catch (error: unknown) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
  return next
}

function parseSource(source: string): StorybookDocument {
  return parseStorybookDocument(JSON.parse(source) as unknown)
}

function authoringValue(document: StorybookDocument, exists: boolean): StorybookAuthoringValue {
  const storybookJson = `${JSON.stringify(document, undefined, 2)}\n`
  return {
    revision: createHash('sha256').update(exists ? 'file\0' : 'missing\0').update(storybookJson).digest('hex'),
    storybookJson,
    exists,
    contextDefaults: {
      discussionSettings: DEFAULT_STORYBOOK_DISCUSSION_SETTINGS,
      reasoningLanguage: DEFAULT_STORYBOOK_REASONING_LANGUAGE,
      contextRules: DEFAULT_STORYBOOK_CONTEXT_RULES,
    },
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
