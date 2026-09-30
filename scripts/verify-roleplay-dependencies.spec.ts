/** Architecture checks reject real import forms, not comments or naming conventions. */
import { expect, it } from 'vitest'
import { inspectRoleplayDependencies } from './verify-roleplay-dependencies.ts'

it('rejects transitive execution imports, application imports, and reverse registry access', () => {
  const path = '/packages/story/roleplay-core/src/characters.ts'
  expect(inspectRoleplayDependencies(path, "import type { Session } from '@deepseek-ai/dsh-session'\nexport * from './commands.ts'\nconst event = 'actor/commit'"))
    .toHaveLength(3)
  expect(inspectRoleplayDependencies(path, "type A = import('node:fs').Stats; const b = import('node:crypto')")).toHaveLength(2)
  expect(inspectRoleplayDependencies('/packages/experimental/actor/src/index.ts', "ctx.get('storyRegistry')")).toHaveLength(1)
  expect(inspectRoleplayDependencies(path, "import { z } from 'zod'\nimport type { RuntimeValues } from './types.ts'\n// actor/commit is documentation only")).toEqual([])
})

it('keeps the independent RPC entry away from legacy aggregates, execution and storage adapters', () => {
  const path = '/packages/api/roleplay-controller/src/index.ts'
  expect(inspectRoleplayDependencies(path, "import { readFile } from 'node:fs'; import { Agent } from '@deepseek-ai/dsh-agent'; import { Story } from '@deepseek-ai/dsh-story'"))
    .toHaveLength(3)
  expect(inspectRoleplayDependencies(path, "import type {} from '@deepseek-ai/dsh-roleplay-services'; import { RoleplayError } from '@deepseek-ai/dsh-roleplay-core'"))
    .toEqual([])
  expect(inspectRoleplayDependencies(path, "type Request = Parameters<Context['roleplayPeople']['create']>[1]"))
    .toEqual(['RPC payloads must use public data contracts, not host Context service signatures'])
})
