/** Historical authoring and book/instance navigation through the shipped plugin composition. */
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import type { CommandId } from '@deepseek-ai/dsh-roleplay-core/types'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-roleplay-services'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage } from './support.ts'
import { MockAdapter, toolCallResponse, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { HarnessDirectorExecutor } from '../../../packages/experimental/actor/src/director-executor.ts'

it('authors in a native AI session, publishes a reviewed book and opens independent runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyweaver-authoring-browser-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
      { id: 'agent-default-model', config: { provider: 'mock', model: 'mock' } },
      { id: 'roleplay-services', config: { databasePath: join(root, 'narrative.sqlite'), provider: 'mock', model: 'mock',
        journalMode: 'wal', busyTimeoutMs: 1000, queryPageLimit: 40, directorCommandLimit: 12,
        discussionTurnLimit: 16, maxContextUpdateUnits: 16, notificationIntervalMs: 10,
        recallCharacterLimit: 6000,
        characterLimits: { maxCoreMemories: 64, maxRecallResults: 8, maxTextBytes: 16384, maxSourceRefs: 16,
          maxActiveGoals: 32, maxScheduledIntentions: 32 },
      } },
    ],
  })
  const browser = await chromium.launch()
  try {
    await writeFile(join(root, 'material.txt'), 'Lighthouse material for this task', 'utf8')
    const adapter = new MockAdapter([
      toolCallResponse('denied-read', 'read', { file_path: join(root, 'material.txt') }),
      toolCallResponse('read-draft', 'storybook_read', {}),
      toolCallResponse('save-draft', 'storybook_save', { expected_revision: 1, storybook_json: JSON.stringify({
        schemaVersion: 6, id: 'harbor', title: 'Creative Harbor', premise: 'A lighthouse signals at noon.',
        directorPrompt: 'Leave the mystery open.', directorGuidance: {}, characters: [],
      }) }),
      textResponse('The lighthouse storybook draft is saved. It is ready for your review.'),
      textResponse('The revised creation guidance is active.'),
      toolCallResponse('local-read', 'read', { file_path: 'material.txt' }),
      toolCallResponse('local-write', 'write', { file_path: 'output.txt', content: 'Authored local material' }),
      textResponse('Local material saved.'),
      toolCallResponse('original-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
      toolCallResponse('rewrite-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
    ])
    const stopAdapter = scaffold.ctx.llm.registerAdapter(['mock'], adapter)
    const page = await newEnglishPage(browser)
    const console = watchConsole(page)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try { await page.getByRole('button', { name: 'AI creation mode', exact: true }).first().click() } catch (error) { throw new Error((await page.locator('body').innerText()) + JSON.stringify(console), { cause: error }) }
    await page.getByRole('button', { name: 'Start a new creation task', exact: true }).click()
    await expect.poll(() => page.getByRole('button', { name: 'Start a new story', exact: true }).isDisabled()).toBe(true)
    await expect.poll(() => page.getByRole('button', { name: 'Play', exact: true }).isDisabled()).toBe(true)
    try { await page.locator('[contenteditable=true][role=textbox]').fill('Create a lighthouse mystery and save its draft. Do not publish it yet.') } catch (error) { throw new Error((await page.locator('body').innerText()) + JSON.stringify(console.pageErrors), { cause: error }) }
    await page.locator('[contenteditable=true][role=textbox]').press('Enter')
    try { await page.getByText('The lighthouse storybook draft is saved. It is ready for your review.', { exact: true }).waitFor({ timeout: 15000 }) }
    catch (error) { throw new Error((await page.locator('body').innerText()) + JSON.stringify(console.pageErrors) + ' requests=' + adapter.requests.length, { cause: error }) }
    const draft = scaffold.ctx.roleplayBooks.list()[0]!
    expect(JSON.stringify(adapter.requests[1])).toContain('no authorized local workspace')
    expect(draft.title).toBe('Creative Harbor')
    expect(draft.latestVersionId).toBeUndefined()
    expect(scaffold.ctx.roleplayBooks.instances()).toHaveLength(0)
    const names = adapter.requests[0]?.tools?.map(tool => tool.name) ?? []
    expect(names).toEqual(expect.arrayContaining(['storybook_read', 'storybook_save', 'storybook_publish', 'read', 'write']))
    expect(names.some(name => /director|actor|web|network/.test(name))).toBe(false)
    await page.reload()
    await page.getByText('The lighthouse storybook draft is saved. It is ready for your review.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Edit creation prompt', exact: true }).click()
    const taskPrompt = page.getByRole('textbox', { name: 'Creation prompt', exact: true })
    await expect.poll(() => taskPrompt.evaluate(element => element === document.activeElement)).toBe(true)
    await taskPrompt.fill('UPDATED EXISTING TASK: focus on the lighthouse keeper.')
    await page.getByRole('combobox', { name: 'Message role', exact: true }).selectOption('user')
    await page.getByRole('button', { name: 'Save task settings', exact: true }).click()
    await page.getByRole('status').getByText('Saved. The next request will use the updated creation settings.', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Edit creation prompt', exact: true }).click()
    await expect.poll(() => taskPrompt.inputValue()).toBe('UPDATED EXISTING TASK: focus on the lighthouse keeper.')
    await page.locator('[contenteditable=true][role=textbox]').fill('Continue with the updated creation guidance.')
    await page.locator('[contenteditable=true][role=textbox]').press('Enter')
    await page.getByText('The revised creation guidance is active.', { exact: true }).waitFor()
    expect(adapter.requests[4]?.messages.some(message => message.role === 'user'
      && JSON.stringify(message.content).includes('UPDATED EXISTING TASK: focus on the lighthouse keeper.'))).toBe(true)
    await page.getByRole('button', { name: 'Storybooks', exact: true }).last().click()
    await page.getByRole('button', { name: 'Creative Harbor', exact: true }).last().click()
    await page.getByRole('button', { name: 'Review publication', exact: true }).click()
    await page.getByRole('button', { name: 'Publish reviewed version', exact: true }).click()
    await page.getByRole('button', { name: 'New story instance', exact: true }).click()
    const first = scaffold.ctx.roleplayBooks.instances()[0]!
    await page.getByRole('button', { name: 'New story instance for Creative Harbor', exact: true }).click()
    const runs = scaffold.ctx.roleplayBooks.instances()
    expect(runs).toHaveLength(2)
    expect(runs[0]!.templateVersionId).toBe(runs[1]!.templateVersionId)
    expect(runs[0]!.id).not.toBe(runs[1]!.id)
    await page.getByRole('button', { name: /Story run 1/ }).first().click()
    const input = page.getByRole('textbox', { name: 'Player action or direction' })
    await input.fill('Keep this unsent draft after refresh')
    await page.reload()
    await expect.poll(() => input.inputValue()).toBe('Keep this unsent draft after refresh')
    expect(scaffold.ctx.roleplayHistory.snapshot(first.id).instance.revision).toBe(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/authoring-recovery-mobile.png', import.meta.url)), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    for (let visit = 0; visit < 2; visit++) {
      await page.getByRole('button', { name: 'Continue creation', exact: true }).first().click()
      const creatorInput = page.locator('[contenteditable=true][role=textbox]')
      await creatorInput.waitFor({ state: 'visible' })
      if (visit === 0) await creatorInput.fill('Keep this separate authoring draft')
      else await expect.poll(() => creatorInput.innerText()).toBe('Keep this separate authoring draft')
      const box = await creatorInput.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(900)
      await page.getByText('The lighthouse storybook draft is saved. It is ready for your review.', { exact: true }).waitFor()
      await page.getByRole('button', { name: /Story run 1/ }).first().click()
      await expect.poll(() => input.inputValue()).toBe('Keep this unsent draft after refresh')
    }
    await page.getByRole('button', { name: 'AI creation mode', exact: true }).first().click()
    await page.getByRole('textbox', { name: 'Local creation directory', exact: true }).fill(root)
    await page.getByRole('button', { name: 'Browse directories', exact: true }).click()
    await page.getByRole('button', { name: 'Select this directory', exact: true }).click()
    await page.getByRole('textbox', { name: 'Creation prompt', exact: true }).fill('CREATOR TASK ONLY guidance')
    await page.getByRole('combobox', { name: 'Message role', exact: true }).selectOption('assistant')
    await page.getByRole('button', { name: 'Start a new creation task', exact: true }).click()
    await page.locator('[contenteditable=true][role=textbox]').fill('Read the local material and write output.txt.')
    await page.locator('[contenteditable=true][role=textbox]').press('Enter')
    // Native permission UI must be present if the configured policy asks.
    await Promise.race([
      page.getByText('Local material saved.', { exact: true }).waitFor(),
      page.getByRole('button', { name: 'Allow once', exact: true }).waitFor().then(async () => { await page.getByRole('button', { name: 'Allow once', exact: true }).click() }),
    ])
    await page.getByText('Local material saved.', { exact: true }).waitFor()
    expect(await readFile(join(root, 'output.txt'), 'utf8')).toBe('Authored local material')
    expect(JSON.stringify(adapter.requests.at(-1))).toContain('Lighthouse material for this task')
    expect(adapter.requests[5]?.messages.some(message => message.role === 'assistant' && JSON.stringify(message.content).includes('CREATOR TASK ONLY guidance'))).toBe(true)
    expect(scaffold.ctx.roleplayBooks.draft(draft.id)?.document).toEqual(draft.document)
    expect(scaffold.ctx.roleplayBooks.list()).toHaveLength(2)
    await page.getByRole('button', { name: /Story run 1/ }).first().click()
    const directionInput = page.getByRole('textbox', { name: 'Player action or direction', exact: true })
    await directionInput.fill('The original lighthouse direction.')
    await directionInput.press('Enter')
    await expect.poll(() => directionInput.inputValue()).toBe('')
    const oldRevision = scaffold.ctx.roleplayHistory.snapshot(first.id).instance.revision
    await page.getByRole('button', { name: 'Edit player direction', exact: true }).click()
    await page.getByRole('textbox', { name: 'Edit player direction', exact: true }).fill('A revised lighthouse direction.')
    await page.getByRole('button', { name: 'Save and resend', exact: true }).click()
    await page.locator('article').getByText('A revised lighthouse direction.', { exact: true }).waitFor()
    await expect.poll(() => scaffold.ctx.roleplayPlay.read({ instanceId: first.id, audience: { kind: 'observer' }, offset: 0, limit: 40 }).phase).toBe('ready')
    expect(scaffold.ctx.roleplayBooks.instances()).toHaveLength(2)
    expect(scaffold.ctx.roleplayPlay.read({ instanceId: first.id, audience: { kind: 'observer' }, revision: oldRevision, offset: 0, limit: 40 }).rows.some(row => row.text === 'The original lighthouse direction.')).toBe(true)
    await page.getByRole('button', { name: 'Delete instance: Creative Harbor · Story run 1', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).last().click()
    expect(scaffold.ctx.roleplayBooks.instances()).toHaveLength(2)
    await page.getByRole('button', { name: 'Delete instance: Creative Harbor · Story run 1', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await expect.poll(() => scaffold.ctx.roleplayBooks.instances().length).toBe(1)
    expect(scaffold.ctx.roleplayBooks.draft(draft.id)?.latestVersionId).toBeDefined()
    await page.getByRole('button', { name: 'Delete storybook: Creative Harbor', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await expect.poll(() => scaffold.ctx.roleplayBooks.list().some(book => book.id === draft.id)).toBe(false)
    expect(scaffold.ctx.roleplayBooks.instances()).toHaveLength(1)
    await page.getByRole('button', { name: 'Delete instance: Creative Harbor · Story run 1', exact: true }).waitFor()

    const bytes = Buffer.from('Portable lighthouse reference', 'utf8')
    const resources = [{ path: 'reference.txt', digest: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }]
    const portable = { format: 'storyweaver-book', version: 1, document: { ...draft.document, title: 'Portable Harbor' }, resources }
    await page.getByRole('button', { name: 'Storybooks', exact: true }).last().click()
    await page.getByLabel('Import storybook JSON', { exact: true }).setInputFiles({ name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(portable)) })
    await expect.poll(() => page.getByRole('textbox', { name: 'Title', exact: true }).inputValue()).toBe('Portable Harbor')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => scaffold.ctx.roleplayBooks.list().some(book => book.title === 'Portable Harbor')).toBe(true)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export storybook', exact: true }).click()
    const download = await downloadPromise
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as typeof portable
    expect(exported).toEqual(portable)

    // Edit a complete book through its focused fields, then prove the published snapshot and request agree.
    await page.getByRole('button', { name: 'Characters', exact: true }).click()
    await page.getByRole('button', { name: 'Add character', exact: true }).click()
    await page.getByRole('textbox', { name: 'True name (author information)', exact: true }).fill('Harbor Keeper')
    await page.getByRole('textbox', { name: 'Appearance and first encounter label', exact: true }).fill('A keeper with a brass lantern')
    await page.getByRole('textbox', { name: 'Personality and habits', exact: true }).fill('The harbor keeper maintains the lighthouse.')
    await page.getByRole('textbox', { name: 'Background and character direction', exact: true }).fill('Protect the missing ship register.')
    await page.getByRole('button', { name: 'Private cognition and memories', exact: true }).click()
    await page.getByRole('textbox', { name: 'Initial subjective experiences (one per line)', exact: true }).fill('PRIVATE-KEEPER-EXPERIENCE')
    const memories = page.getByRole('region', { name: 'Initial core memories', exact: true })
    await memories.getByRole('button', { name: 'Add entry', exact: true }).click()
    await memories.getByRole('textbox', { name: 'Value', exact: true }).fill('The storm destroyed the harbor bell.')
    await page.getByRole('button', { name: 'Initial dynamic state', exact: true }).click()
    await page.getByRole('button', { name: 'Add state field', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Trust')
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Trust in visitors')
    await page.getByRole('textbox', { name: 'Group', exact: true }).fill('Relationships')
    await page.getByRole('textbox', { name: 'Value', exact: true }).fill('Cautious')
    await page.getByRole('combobox', { name: 'State ownership', exact: true }).selectOption('world')
    await page.getByRole('group', { name: 'Characters who can perceive this state', exact: true }).getByRole('checkbox', { name: 'Harbor Keeper', exact: true }).check()
    await page.getByRole('combobox', { name: 'Relationship target', exact: true }).selectOption({ label: 'Harbor Keeper' })
    await page.getByRole('button', { name: 'Context recipe', exact: true }).click()
    await page.getByRole('button', { name: 'Actor', exact: true }).click()
    await page.getByText(/^\d+\. Reasoning mode$/u).click()
    const reasoning = page.getByRole('textbox', { name: 'Reasoning instructions', exact: true })
    await expect.poll(() => reasoning.inputValue()).toContain('〖角色沉浸要求〗')
    await reasoning.fill((await reasoning.inputValue()) + '\nBOOK-ACTOR-REASONING-TEST')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => JSON.stringify(scaffold.ctx.roleplayBooks.list().find(book => book.title === 'Portable Harbor')?.document)).toContain('BOOK-ACTOR-REASONING-TEST')
    await page.getByRole('status').filter({ hasText: /^Saved$/u }).waitFor()
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/editor-context-light.png', import.meta.url)), fullPage: true })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).not.toBeNull()
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/editor-context-dark.png', import.meta.url)), fullPage: true })
    await page.reload()
    await page.getByRole('button', { name: 'Review publication', exact: true }).click()
    await page.getByRole('button', { name: 'Publish reviewed version', exact: true }).click()
    await page.getByRole('region', { name: 'Portable Harbor', exact: true }).getByRole('button', { name: 'New story instance for Portable Harbor', exact: true }).click()
    const fresh = scaffold.ctx.roleplayBooks.instances().at(-1)!
    const tools = page.getByRole('navigation', { name: 'Story tools', exact: true })
    await tools.getByRole('button', { name: 'Characters', exact: true }).waitFor()
    await tools.getByRole('button', { name: 'State system', exact: true }).click()
    await page.getByRole('heading', { name: 'Author workspace', exact: true }).waitFor()
    const keeper = scaffold.ctx.roleplayViews.authorPeople(fresh.id, { query: '', offset: 0, limit: 20 }).entries[0]!
    const cognition = scaffold.ctx.roleplayViews.authorCognition(fresh.id, keeper.definition.actorId)
    expect(cognition.current.dynamicState.entries).toEqual([])
    const worldState = scaffold.ctx.roleplayAuthor.workspace({ instanceId: fresh.id }).worldState.entries[0]!
    expect(worldState.value).toBe('Cautious')
    expect(worldState.definition).toMatchObject({ owner: 'world', audience: [keeper.definition.actorId], targetActorId: keeper.definition.actorId })
    const context = scaffold.ctx.roleplayViews.actorContext({ instanceId: fresh.id, actorId: keeper.definition.actorId, query: '' })
    expect(context.text).toContain('PRIVATE-KEEPER-EXPERIENCE')
    expect(context.sections.at(-1)).toMatchObject({ id: 'reasoning-mode', role: 'user' })
    expect(context.sections.at(-1)?.content).toContain('BOOK-ACTOR-REASONING-TEST')
    const performed = new MockAdapter([toolCallResponse('keeper-turn', 'npc_commit_turn', { posture: 'waiting', behavior: [] })])
    stopAdapter()
    const stopPerformed = scaffold.ctx.llm.registerAdapter(['mock'], performed)
    await scaffold.ctx.roleplayRuntime.run({ instanceId: fresh.id, id: randomUUID() as CommandId, expectedRevision: fresh.revision, principal: { kind: 'player' } }, keeper.definition.actorId)
    expect(JSON.stringify(performed.requests[0]?.messages.at(-1))).toContain('BOOK-ACTOR-REASONING-TEST')
    expect(performed.requests[0]?.messages.at(-1)?.role).toBe('user')
    const recordedMessage = performed.requests[0]!.messages.at(-1)!
    const recordedText = recordedMessage.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    const reasoningStart = recordedText.indexOf('〖角色沉浸要求〗')
    expect(reasoningStart).toBeGreaterThanOrEqual(0)
    await expect(JSON.stringify({ role: recordedMessage.role, finalInstructions: recordedText.slice(reasoningStart) }, null, 2))
      .toMatchFileSnapshot('./authoring-recovery-reasoning.expected.json')

    const directorCalls = new MockAdapter([
      toolCallResponse('director-find', 'director_command', { command: { operation: 'find', query: '', offset: 0, limit: 20 } }),
      toolCallResponse('director-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
    ])
    stopPerformed()
    scaffold.ctx.llm.registerAdapter(['mock'], directorCalls)
    const executor = new HarnessDirectorExecutor(scaffold.ctx.agents, { agentOptions: { provider: 'mock', model: 'mock' },
      setup: async () => {}, exists: async () => false, flush: async (session) => { await scaffold.ctx.sessions.flush(session) } })
    try {
      const context = scaffold.ctx.roleplayDirectorViews.context({ instanceId: fresh.id, instruction: 'Continue the lighthouse scene.' })
      await executor.execute({ attempt: randomUUID(), context }, new AbortController().signal,
        (_id, command) => ({ complete: command.operation === 'finish', result: {} }))
      expect(directorCalls.requests).toHaveLength(2)
      for (const request of directorCalls.requests) {
        const system = request.messages.filter(message => message.role === 'system').map(message => JSON.stringify(message.content)).join('\n')
        const user = request.messages.filter(message => message.role === 'user').map(message => JSON.stringify(message.content)).join('\n')
        expect(system).toContain('DIRECTOR — private author information')
        expect(user).toContain('〖思维模式要求〗')
        expect(user).not.toContain('〖角色沉浸要求〗')
      }
    } finally { await executor.dispose() }
    expect(console.pageErrors).toEqual([])
  } finally { await browser.close(); await scaffold.close(); await rm(root, { recursive: true, force: true }) }
}, 120000)
