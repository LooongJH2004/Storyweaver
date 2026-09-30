// Keyless assembled-browser coverage for the Storyweaver discussion mode.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ActorId } from '@deepseek-ai/dsh-experimental-actor'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-story'
import type {} from '@deepseek-ai/dsh-story-home'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/roleplay-discussion-console', import.meta.url))
const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.jsonl', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const OVERLAY = fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/tests/fixtures/legacy-profile/cordis.patch.yml', import.meta.url))
const INSTALL_ANCHORS = [
  fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/tests/fixtures/legacy-profile/package.json', import.meta.url)),
]
const MODE = webSnapshotMode()
const SESSION_ID = 'roleplay-discussion-console-director'

describe('web e2e: Storyweaver discussion console', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: OVERLAY,
      extraInstallAnchors: INSTALL_ANCHORS,
      directoryPickerMode: 'overlay',
      extraEntryOverrides: [
        { id: 'roleplay-directory-picker-native', disabled: true },
        { id: 'roleplay-directory-picker-controller', disabled: true },
        { id: 'tool-actor', disabled: true },
        { id: 'tool-director', disabled: true },
      ],
    })
    const story = await scaffold.ctx.storyRegistry.create('Moonshadow Ledger')
    await writeFile(scaffold.ctx.storyHome.storyPath(story.id, 'world', 'storybook.json'), JSON.stringify({
      schemaVersion: 6,
      id: 'moonshadow-ledger',
      title: 'Moonshadow Ledger',
      directorPrompt: 'Advance the scene without deciding for persistent characters.',
      reasoningLanguage: 'English',
      worldTruth: { secret: 'The red thread binds the ledger to a forgotten oath.' },
      discussionSettings: { maxRounds: 3 },
      directorGuidance: { narrativeStyle: 'Restrained urban fantasy.' },
      characters: [
        {
          actorId: 'shadowheart', displayName: 'Shadowheart',
          publicPersona: 'A guarded cleric suspicious of memory magic.',
          rolePrompt: 'Act only from Shadowheart’s knowledge and goals.',
          state: [],
          capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
          privateContext: { perspective: ['The thread resembles an old ritual binding.'] },
          actingGuidance: { speechStyle: 'Brief, cool questions.' },
        },
        {
          actorId: 'astarion', displayName: 'Astarion',
          publicPersona: 'Observant, masking caution with wit.',
          rolePrompt: 'Act only from Astarion’s knowledge and goals.',
          state: [],
          capabilities: ['speak', 'act', 'reflect', 'memory', 'goals', 'schedule'],
          privateContext: { perspective: ['The blank ledger entry looks deliberately erased.'] },
          actingGuidance: { speechStyle: 'Lightly sardonic but alert.' },
        },
      ],
    }), 'utf8')
    await writeFile(
      scaffold.ctx.storyHome.storyPath(story.id, 'world', 'opening.md'),
      'The ledger opens by itself. Its fourth line remains blank.',
      'utf8',
    )
    const directorSessionId = await seedSession(
      scaffold, await readFile(SEED, 'utf8'), SESSION_ID, 'storyweaver',
    )
    await scaffold.ctx.storyRegistry.attachSession(story.id, directorSessionId, 'scene')
    for (const actorId of ['shadowheart', 'astarion']) {
      const actor = scaffold.ctx.agentLoop.create(SessionId(`roleplay-discussion-${actorId}`), { provider: 'unused', model: 'unused' })
      scaffold.ctx.actors.bind(actor, { id: ActorId(actorId), displayName: actorId === 'shadowheart' ? 'Shadowheart' : 'Astarion',
        persona: 'A cautious participant.', capabilities: ['speak', 'act', 'reflect'] })
      scaffold.ctx.actors.initializeState(actor, [], ['shadowheart', 'astarion'])
      await scaffold.ctx.storyRegistry.attachSession(story.id, actor.session.id, 'actor', actorId)
    }
    let changed = await scaffold.ctx.storyRegistry.stageScene(story.id, {
      expectedWorldRevision: story.world.revision,
      sceneId: 'private-room',
      location: 'Private room',
      summary: 'The ledger and both participants share the same room.',
      presentActorIds: ['shadowheart', 'astarion'],
    })
    changed = await scaffold.ctx.storyRegistry.startDiscussion(story.id, {
      expectedRevision: changed.discussions.revision,
      topic: 'Should the red thread be cut?',
      participantIds: ['shadowheart', 'astarion'],
      maxRounds: 3,
      initiatedBy: 'director',
    })
    const discussionId = changed.discussions.discussions[0]?.id
    if (discussionId === undefined) throw new Error('discussion fixture was not created')
    changed = await scaffold.ctx.storyRegistry.updateDiscussionParticipantIntent(
      story.id, changed.discussions.revision, discussionId, 'shadowheart',
      { stance: 'Do not cut it before tracing the binding.', eagerness: 'high', action: 'pass' },
    )
    changed = await scaffold.ctx.storyRegistry.updateDiscussionParticipantIntent(
      story.id, changed.discussions.revision, discussionId, 'astarion',
      { stance: 'Trace the other end first.', eagerness: 'medium', action: 'pass' },
    )
    changed = await scaffold.ctx.storyRegistry.updateDiscussionParticipantIntent(
      story.id, changed.discussions.revision, discussionId, 'shadowheart',
      { stance: 'Do not cut it before tracing the binding.', eagerness: 'high', action: 'speak', nextSpeakerId: 'astarion' },
    )
    await scaffold.ctx.storyRegistry.recordDiscussionTurn(story.id, {
      expectedRevision: changed.discussions.revision,
      discussionId,
      speakerId: 'shadowheart',
      text: 'We trace where it leads before anyone reaches for a blade.',
      action: 'speak',
    })

    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try {
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    } catch (error) {
      throw new Error(`roleplay page did not mount: ${await page.locator('body').innerText()} ${tripwire.pageErrors.join(' | ')}`, { cause: error })
    }
    const console = page.getByRole('region', { name: 'Group discussion console' })
    if (!await console.isVisible().catch(() => false)) {
      await page.getByText('Use the read tool twice', { exact: true }).first().click()
    }
    await console.waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('pins the live discussion mode at the composer', async () => {
    onTestFailed(() => saveFailureShot(page, 'roleplay-discussion-console'))
    const console = page.getByRole('region', { name: 'Group discussion console' })
    await expect.poll(() => console.getByText('Astarion is preparing the next contribution').count()).toBe(1)
    await expect.poll(() => page.getByRole('button', { name: 'Observe', exact: true }).count()).toBe(1)
    const snapshot = await captureStableAria(page, '[aria-label="Group discussion console"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })

  it('fills mode suggestions in the real editor and keeps player edits while changing modes', async () => {
    const editor = page.locator('[data-composer-input][contenteditable="true"]').first()
    await editor.fill('')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect.poll(() => editor.innerText()).toBe('Keep the world moving.')
    await page.getByRole('button', { name: 'Choose direction', exact: true }).click()
    await expect.poll(() => editor.innerText()).toBe('I want the story to move toward:')
    await editor.fill('Let them question the courier without deciding the answer.')
    await page.getByRole('button', { name: 'Intervene', exact: true }).click()
    await expect.poll(() => editor.innerText()).toBe('Let them question the courier without deciding the answer.')
    await editor.fill('')
    expect(tripwire.pageErrors).toEqual([])
  })

  it('edits a dynamic state in the desktop sidebar and keeps the narrow drawer within the viewport', async () => {
    onTestFailed(() => saveFailureShot(page, 'roleplay-dynamic-state'))
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: 'Open character state panel' }).click()
    const panel = page.getByRole('dialog', { name: 'Character state', exact: true })
    await expect.poll(() => panel.getAttribute('aria-modal')).toBe('false')
    await panel.getByRole('button', { name: 'Add state', exact: true }).click()
    await panel.getByLabel('Name', { exact: true }).fill('Trust in the visitor')
    await panel.getByLabel('Meaning', { exact: true }).fill('A subjective impression of the visitor.')
    await panel.getByLabel('When and how it changes').fill('Changes after observing their actions.')
    await panel.getByLabel('Current value', { exact: true }).fill('Willing to listen, still cautious.')
    await panel.getByLabel('Reason for change').fill('The visitor offered to help.')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => panel.getByText('Willing to listen, still cautious.', { exact: true }).count()).toBe(1)
    const composer = await page.locator('[data-conversation-composer-area]').boundingBox()
    const sidebar = await panel.boundingBox()
    expect(composer!.x + composer!.width).toBeLessThanOrEqual(sidebar!.x + 1)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/storyweaver-desktop.png', import.meta.url)) })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => panel.getAttribute('aria-modal')).toBe('true')
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/storyweaver-narrow.png', import.meta.url)) })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 960 })
    expect(tripwire.pageErrors).toEqual([])
  })

  it('saves a story performance override through the direct style workspace entry', async () => {
    onTestFailed(() => saveFailureShot(page, 'roleplay-style-workspace'))
    await page.getByRole('button', { name: 'Performance style', exact: true }).click()
    await page.getByLabel('Narrative diction', { exact: true }).fill('Spare sentences with concrete sensory details.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => page.getByText('Saved. Applies from the next model request.', { exact: true }).count()).toBe(1)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/storyweaver-style.png', import.meta.url)) })
    await page.getByRole('dialog', { name: 'Performance style', exact: true }).getByRole('button', { name: 'Close workspace', exact: true }).click()
    await page.getByRole('dialog', { name: 'Context builder', exact: true }).getByRole('button', { name: 'Close workspace', exact: true }).click()
    expect(tripwire.pageErrors).toEqual([])
  })
})
