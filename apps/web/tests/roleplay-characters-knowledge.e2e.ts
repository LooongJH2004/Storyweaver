/** Keyless browser interactions with the actual instance-person and knowledge APIs. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { parseStorybookDocument } from '@deepseek-ai/dsh-story'
import { launchWebScaffold, seedSession, watchConsole } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

it('edits instance people without revealing names in spectator view, and keeps invalid knowledge drafts', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/tests/fixtures/legacy-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/tests/fixtures/legacy-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'roleplay-directory-picker-native', disabled: true }, { id: 'roleplay-directory-picker-controller', disabled: true },
      { id: 'tool-actor', disabled: true }, { id: 'tool-director', disabled: true },
    ],
  })
  const browser = await chromium.launch()
  try {
    const story = await scaffold.ctx.storyRegistry.create('Identity browser replay')
    const book = parseStorybookDocument({ schemaVersion: 6, id: 'identity-browser', title: 'Identity browser replay', directorPrompt: '', directorGuidance: {},
      characters: [{ actorId: 'guard', displayName: 'Arden', appearance: 'A tired guard', publicPersona: 'A watchful guard', rolePrompt: '', actingGuidance: {}, capabilities: ['speak', 'reflect'],
        initialKnowledge: [{ text: 'The locked room may be empty.', attitude: 'doubted' }] },
      { actorId: 'traveler', displayName: 'UNREVEALED TRAVELER', appearance: 'A rain-soaked traveler', publicPersona: 'Needs a room', rolePrompt: '', actingGuidance: {}, capabilities: ['speak', 'reflect'] }] })
    await writeFile(scaffold.ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), JSON.stringify(book), 'utf8')
    await scaffold.ctx.storyRegistry.initializeCharacters(story.id, book)
    await scaffold.ctx.storyRegistry.stageScene(story.id, { expectedWorldRevision: 0, sceneId: 'inn', location: 'Inn', summary: 'Two people at the inn.', presentActorIds: ['guard', 'traveler'],
      perceptions: [{ actorId: 'guard', content: 'A traveler approaches.' }, { actorId: 'traveler', content: 'A guard waits.' }] })
    const sessionId = await seedSession(scaffold, await readFile(fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.jsonl', import.meta.url)), 'utf8'), 'identity-browser-director', 'storyweaver')
    await scaffold.ctx.storyRegistry.attachSession(story.id, sessionId, 'scene')
    const page = await newEnglishPage(browser)
    page.setDefaultTimeout(8000)
    const console = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    if (await page.getByRole('button', { name: 'People and knowledge', exact: true }).count() === 0) await page.getByText('Use the read tool twice', { exact: true }).first().click()
    await page.getByRole('button', { name: 'People and knowledge', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'People and knowledge', exact: true })
    try { await panel.getByRole('listitem').filter({ hasText: 'A rain-soaked traveler' }).waitFor({ timeout: 10000 }) } catch (error) { throw new Error(await panel.innerText(), { cause: error }) }
    expect(await panel.getByText('UNREVEALED TRAVELER', { exact: true }).count()).toBe(0)
    await panel.getByLabel('Perspective', { exact: true }).selectOption('guard')
    await expect.poll(() => panel.getByText('The locked room may be empty.', { exact: true }).count()).toBe(1)
    await panel.getByRole('button', { name: 'Revise', exact: true }).click()
    await panel.getByLabel('Judgment', { exact: true }).fill('The room might contain a witness.')
    await panel.getByLabel('Reason for revision', { exact: true }).fill('Player correction based on the scene.')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => scaffold.ctx.storyRegistry.get(story.id)!.world.characters.knowledge.guard!.entries[0]!.revision).toBe(2)
    await panel.getByLabel('Author view: inspect and edit complete definitions').check()
    await panel.getByRole('button', { name: 'Create supporting character', exact: true }).click()
    await panel.getByLabel('True name (author definition)').fill('New innkeeper')
    await panel.getByLabel('Visible appearance / first encounter label').fill('A flour-dusted innkeeper')
    await panel.getByLabel('Personality and habits', { exact: true }).fill('Keeps the inn in order')
    const initial = panel.getByLabel('Initial knowledge and acquaintances (JSON, initialization only)')
    await initial.fill('[{"text":')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => panel.getByRole('alert').count()).toBe(1)
    expect(await initial.inputValue()).toBe('[{"text":')
    expect(scaffold.ctx.storyRegistry.get(story.id)!.world.characters.entries).toHaveLength(2)
    await initial.fill('[{"text":"I own this inn."}]')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => scaffold.ctx.storyRegistry.get(story.id)!.world.characters.entries.length).toBe(3)
    const created = scaffold.ctx.storyRegistry.get(story.id)!.world.characters.entries.find(item => item.definition.displayName === 'New innkeeper')!
    expect(created.definition.actorId).toMatch(/^character-/u)
    expect(story.sessions.some(item => item.actorId === created.definition.actorId)).toBe(false)
    expect(parseStorybookDocument(JSON.parse(await readFile(scaffold.ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), 'utf8'))).characters).toHaveLength(2)
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: 'People and knowledge', exact: true }).click()
    await page.getByRole('dialog', { name: 'People and knowledge' }).getByLabel('Author view: inspect and edit complete definitions').check()
    await expect.poll(() => page.getByRole('dialog', { name: 'People and knowledge' }).getByText('New innkeeper', { exact: true }).count()).toBe(1)
    expect(console.pageErrors).toEqual([])
  } finally { await browser.close(); await scaffold.close() }
}, 120_000)
