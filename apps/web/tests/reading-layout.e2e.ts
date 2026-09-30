/** Keyless layout checks avoid model execution and preserve the writing draft. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-roleplay-services'
import type { BookId, CommandId } from '@deepseek-ai/dsh-roleplay-core/types'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage } from './support.ts'
import { MockAdapter, toolCallResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

class RecordedMock extends MockAdapter {
  private resume: (() => void) | undefined
  continueDraft(): void { this.resume?.() }
  private pauseDraft(options: GenerateOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = () => { this.resume = undefined; reject(new Error('Stream cancelled')) }
      this.resume = () => { options.signal?.removeEventListener('abort', abort); this.resume = undefined; resolve() }
      if (options.signal?.aborted) abort()
      else options.signal?.addEventListener('abort', abort, { once: true })
    })
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    for await (const chunk of super.stream(options)) {
      if (this.requests.length === 2 && chunk.type === 'finish') await this.pauseDraft(options)
      if (this.requests.length !== 2 || chunk.type !== 'tool-call-delta' || !chunk.argumentsDelta) { yield chunk; continue }
      const parts = chunk.argumentsDelta.split(/(?=\\n\\nGrowth )/u)
      for (let index = 0; index < parts.length; index++) {
        if (index > 0) await this.pauseDraft(options)
        yield { ...chunk, argumentsDelta: parts[index]! }
      }
    }
  }
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

it('resizes the reading and writing surfaces with persistence, cancellation and narrow-screen controls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyweaver-layout-browser-'))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/cordis.patch.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('../../../packages/experimental/roleplay-web-profile/package.json', import.meta.url))],
    directoryPickerMode: 'overlay', extraEntryOverrides: [
      { id: 'story-home', config: { root } },
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
    const draft = scaffold.ctx.roleplayBooks.saveDraft({ id: 'ledger' as BookId, expectedRevision: 0, title: 'Independent Ledger', resources: [],
      document: { schemaVersion: 6, id: 'ledger', title: 'Independent Ledger', directorPrompt: '', directorGuidance: {},
        characters: [{ actorId: 'keeper', displayName: 'UNREVEALED NAME', appearance: 'A flour-dusted innkeeper',
          initialKnowledge: [{ text: 'The inn is a safe meeting place.', kind: 'belief', attitude: 'doubted' },
            ...Array.from({ length: 12 }, (_, index) => ({ text: `Remembered guest ${index + 1}.`, kind: 'belief', attitude: 'believed' }))],
          rolePrompt: '', publicPersona: 'Keeps an inn', capabilities: ['speak', 'act'], actingGuidance: {} }] } })
    const version = scaffold.ctx.roleplayBooks.publish(draft.id, draft.revision)
    const instance = scaffold.ctx.roleplayInstances.createStory({ templateVersionId: version.id, commandId: 'create-A' as CommandId }).instance
    const page = await newEnglishPage(browser)
    page.setDefaultTimeout(15000)
    await page.addInitScript(() => {
      if (localStorage.getItem('dsh.conversation.contentWidth') === null) localStorage.setItem('dsh.conversation.contentWidth', '840')
    })
    const console = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: /Story run \d+ Pinned version 1/u }).click()
    await page.getByRole('heading', { name: 'Independent Ledger', exact: true }).waitFor()
    const reading = page.getByRole('separator', { name: 'Resize reply width (right); double-click to reset layout', exact: true, includeHidden: true }).locator('..').locator('..')
    // Resize the real reading/composer surfaces; previews must not persist before release.
    const widthGrip = page.getByRole('separator', { name: 'Resize reply width (right); double-click to reset layout', exact: true })
    const heightGrip = page.getByRole('separator', { name: 'Resize composer height; double-click to reset layout', exact: true })
    const layoutComposer = page.getByRole('form', { name: 'Player action or direction', exact: true })
    await widthGrip.press('ArrowRight')
    await expect.poll(async () => Math.round((await reading.boundingBox())!.width)).toBe(860)
    const gripBox = (await heightGrip.boundingBox())!
    const gripX = gripBox.x + gripBox.width / 2
    const gripY = gripBox.y + gripBox.height / 2
    await page.mouse.move(gripX, gripY)
    await page.mouse.down()
    await page.mouse.move(gripX, gripY - 64, { steps: 8 })
    await expect.poll(async () => Math.round((await layoutComposer.boundingBox())!.height)).toBe(320)
    expect(await page.evaluate(() => localStorage.getItem('storyweaver.composerHeight'))).toBeNull()
    await page.mouse.up()
    await page.reload()
    await layoutComposer.waitFor()
    await expect.poll(async () => Math.round((await layoutComposer.boundingBox())!.height)).toBe(320)
    await expect.poll(async () => Math.round((await reading.boundingBox())!.width)).toBe(860)
    await heightGrip.focus()
    const cancelBox = (await heightGrip.boundingBox())!
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y - 40, { steps: 4 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(async () => Math.round((await layoutComposer.boundingBox())!.height)).toBe(320)
    expect(await page.evaluate(() => localStorage.getItem('storyweaver.composerHeight'))).toBe('320')
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await page.getByRole('slider', { name: /^Composer height/u }).fill('256')
    await page.getByRole('slider', { name: /^Reply width/u }).fill('840')
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await expect.poll(async () => Math.round((await layoutComposer.boundingBox())!.height)).toBe(256)
    await expect.poll(async () => Math.round((await reading.boundingBox())!.width)).toBe(840)
    await page.setViewportSize({ width: 375, height: 812 })
    await expect.poll(async () => (await reading.boundingBox())!.width).toBeLessThan(375)
    await expect.poll(async () => {
      const mobileModel = (await page.getByRole('button', { name: /^Select model, current/u }).boundingBox())!
      const mobileSend = (await layoutComposer.locator('button[type="submit"]').boundingBox())!
      return mobileModel.x + mobileModel.width - mobileSend.x
    }).toBeLessThanOrEqual(0)
    expect((await page.getByRole('button', { name: 'More actions', exact: true }).boundingBox())!.width).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await page.getByRole('slider', { name: /^Composer height/u }).press('Escape')
    expect(await page.getByRole('button', { name: 'Layout', exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(async () => Math.round((await reading.boundingBox())!.width)).toBe(840)
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('storyweaver.composerHeight'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('dsh.conversation.contentWidth'))).toBeNull()
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id).instance.revision).toBe(0)
    // Streaming and committed prose must share geometry, including the people panel and mobile layout.
    await page.getByRole('slider', { name: /^Reply width/u }).fill('760')
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    scaffold.ctx.roleplayPeople.stage({ instanceId: instance.id, id: 'layout-stage' as CommandId,
      expectedRevision: 0, principal: { kind: 'player' } }, { id: 'inn', location: 'Quiet inn', present: ['keeper'], appearances: [] })
    const adapter = new RecordedMock([
      toolCallResponse('layout-accepted', 'npc_commit_turn', { posture: 'watching', behavior: [{ kind: 'speech', text: 'Accepted layout sample.' }] }),
      toolCallResponse('layout-streaming', 'npc_commit_turn', {
        posture: 'watching', behavior: [{ kind: 'speech', text: 'Streaming layout sample.'
          + [1, 2, 3].map(index => `\n\nGrowth ${index}: ${'The keeper watches the door. '.repeat(100)}`).join('') }],
      }),
      toolCallResponse('layout-finish', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } }),
    ])
    scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter(['mock'], adapter))
    await scaffold.ctx.roleplayRuntime.run({ instanceId: instance.id, id: 'layout-first' as CommandId,
      expectedRevision: 1, principal: { kind: 'player' } }, 'keeper')
    await page.getByText('Accepted layout sample.', { exact: true }).waitFor()
    const pending = scaffold.ctx.roleplayRuntime.run({ instanceId: instance.id, id: 'layout-streaming' as CommandId,
      expectedRevision: scaffold.ctx.roleplayHistory.snapshot(instance.id).instance.revision, principal: { kind: 'player' } }, 'keeper')
      .catch((error: unknown) => error)
    await page.getByText('Streaming layout sample.', { exact: true }).waitFor()
    const live = page.getByRole('region', { name: 'Live execution diagnostics', exact: true })
    const assertAligned = async () => {
      await expect.poll(async () => {
        const accepted = (await page.locator('article').boundingBox())!
        const streaming = (await live.boundingBox())!
        return Math.abs(accepted.x - streaming.x) + Math.abs(accepted.width - streaming.width)
      }).toBeLessThan(1)
    }
    await assertAligned()
    const main = page.getByRole('main')
    const bottomGap = () => main.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)
    const firstParagraph = await live.getByText('Streaming layout sample.', { exact: true }).elementHandle()
    const composerBox = (await layoutComposer.boundingBox())!
    // Start the following check at the bottom after the initial draft has mounted.
    await main.evaluate(async (element) => {
      element.scrollTop = element.scrollHeight
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { resolve() })))
    })
    // Real streamed tool arguments grow without changing the accepted row id.
    adapter.continueDraft()
    await live.locator('[data-execution-draft]').getByText(/^Growth 1:/u).waitFor()
    await expect.poll(bottomGap).toBeLessThan(2)
    adapter.continueDraft()
    await live.locator('[data-execution-draft]').getByText(/^Growth 2:/u).waitFor()
    await expect.poll(bottomGap).toBeLessThan(2)
    expect(await firstParagraph!.evaluate(element => element.isConnected)).toBe(true)
    const currentComposer = (await layoutComposer.boundingBox())!
    expect(Math.abs(currentComposer.x - composerBox.x)).toBeLessThan(1)
    expect(Math.abs(currentComposer.width - composerBox.width)).toBeLessThan(1)
    await main.evaluate((element) => { element.scrollTop = 200 })
    await page.getByRole('button', { name: 'Latest story', exact: true }).waitFor()
    const readingPosition = await main.evaluate(element => element.scrollTop)
    adapter.continueDraft()
    await live.locator('[data-execution-draft]').getByText(/^Growth 3:/u).waitFor({ state: 'attached' })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { resolve() }))))
    expect(Math.abs(await main.evaluate(element => element.scrollTop) - readingPosition)).toBeLessThan(2)
    await page.getByRole('button', { name: 'Latest story', exact: true }).click()
    await expect.poll(bottomGap).toBeLessThan(2)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/alignment-desktop.png', import.meta.url)), fullPage: true })
    const tools = page.getByRole('navigation', { name: 'Story tools', exact: true })
    const assertToolsVisible = async () => {
      const viewport = (await main.boundingBox())!
      const box = (await tools.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(viewport.y)
      expect(box.y + box.height).toBeLessThan((await layoutComposer.boundingBox())!.y)
      for (const button of await tools.getByRole('button').all()) {
        const bounds = (await button.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(viewport.x)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width)
      }
    }
    await assertToolsVisible()
    const beforePeople = await main.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }))
    const assertPeopleScrollStable = async () => {
      const after = await main.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }))
      expect(after.height).toBe(beforePeople.height)
      // Focus restoration can round the bottom offset of fractional line boxes.
      expect(Math.abs(after.top - beforePeople.top)).toBeLessThanOrEqual(2)
    }
    await page.getByRole('button', { name: 'People in this scene', exact: true }).click()
    const peopleDialog = page.getByRole('dialog', { name: 'People in this scene', exact: true })
    await peopleDialog.getByRole('button', { name: 'View knowledge', exact: true }).waitFor()
    await assertPeopleScrollStable()
    await page.keyboard.press('Escape')
    await peopleDialog.waitFor({ state: 'hidden' })
    expect(await page.getByRole('button', { name: 'People in this scene', exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
    await assertPeopleScrollStable()
    await page.setViewportSize({ width: 375, height: 812 })
    // Wait for the native shell's ResizeObserver to apply its narrow-screen collapse.
    await expect.poll(async () => (await main.boundingBox())!.width).toBeGreaterThan(300)
    await assertAligned()
    await main.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await assertToolsVisible()
    await page.getByRole('button', { name: 'People in this scene', exact: true }).click()
    const peopleBox = (await peopleDialog.boundingBox())!
    expect(peopleBox.x).toBeGreaterThanOrEqual(0)
    expect(peopleBox.x + peopleBox.width).toBeLessThanOrEqual(375)
    await peopleDialog.getByRole('button', { name: 'Close panel', exact: true }).click()
    await live.scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/alignment-mobile.png', import.meta.url)), fullPage: true })
    await page.getByRole('button', { name: 'Latest story', exact: true }).click()
    adapter.continueDraft()
    await pending
    await live.waitFor({ state: 'detached' })
    await expect.poll(() => layoutComposer.locator('button[type="submit"]').isEnabled()).toBe(true)
    await expect.poll(bottomGap).toBeLessThan(2)
    await expect.poll(() => page.locator('[data-execution-usage]').count()).toBe(2)
    const settledGeometry = await main.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }))
    const samples = await main.evaluate(async (element) => {
      const values = []
      for (let index = 0; index < 30; index++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => { resolve() }))
        values.push({ top: element.scrollTop, height: element.scrollHeight })
      }
      return values
    })
    expect(samples.every(value => value.top === settledGeometry.top && value.height === settledGeometry.height)).toBe(true)
    const timing = page.locator('[data-execution-usage]').nth(1)
    await timing.getByText(/^Turn TTFT: [\d.]+ s$/u).waitFor()
    await timing.getByText(/^Turn average generation: [\d.]+ tok\/s$/u).waitFor()
    expect(await timing.getByText(/Not recorded/u).count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await timing.screenshot({ path: fileURLToPath(new URL('../../../.tmp/native-turn-timing-mobile.png', import.meta.url)) })
    const acceptedFooter = await page.locator('[data-execution-usage]').first().elementHandle()
    await page.getByRole('textbox', { name: 'Player action or direction' }).fill('Finish the layout check.')
    await layoutComposer.locator('button[type="submit"]').click()
    await expect.poll(() => adapter.requests.length).toBe(3)
    await expect.poll(() => layoutComposer.locator('button[type="submit"]').isEnabled()).toBe(true)
    expect(await page.getByText('Request in progress', { exact: true }).count()).toBe(0)
    expect(await acceptedFooter!.evaluate(element => element.isConnected)).toBe(true)
    const unsentDirection = 'Keep this unsent direction while checking the story settings.'
    await page.getByRole('textbox', { name: 'Player action or direction' }).fill(unsentDirection)
    for (const name of ['Characters', 'State system', 'Performance style', 'Context']) {
      await main.evaluate((element) => { element.scrollTop = 300 })
      await page.getByRole('button', { name: 'Latest story', exact: true }).waitFor()
      const beforeAuthor = await main.evaluate(element => element.scrollTop)
      await tools.getByRole('button', { name, exact: true }).click()
      await page.getByRole('heading', { name: 'Author workspace', exact: true }).waitFor()
      await main.evaluate((element) => { element.scrollTop = element.scrollHeight })
      const back = page.getByRole('button', { name: 'Back to story', exact: true })
      const backBox = (await back.boundingBox())!
      const mainBox = (await main.boundingBox())!
      expect(backBox.y).toBeGreaterThanOrEqual(mainBox.y)
      expect(backBox.y + backBox.height).toBeLessThan(mainBox.y + mainBox.height)
      expect(backBox.x + backBox.width).toBeLessThanOrEqual(mainBox.x + mainBox.width)
      await back.click()
      await tools.waitFor()
      await expect.poll(async () => Math.abs(await main.evaluate(element => element.scrollTop) - beforeAuthor)).toBeLessThan(2)
      expect(await page.getByRole('textbox', { name: 'Player action or direction' }).inputValue()).toBe(unsentDirection)
    }
    scaffold.ctx.roleplayWorld.observe({ instanceId: instance.id, id: 'formatted-narration' as CommandId,
      expectedRevision: scaffold.ctx.roleplayHistory.snapshot(instance.id).instance.revision, principal: { kind: 'player' } },
    { summary: 'Evening notes', content: 'The lamp is lit.', state: [], deliveries: [],
      narration: 'Evening arrives.\\n\\nThe lamp is lit.<br>The door opens.\n\n## Evening notes\n\n'
        + '> Rain taps the window.\n\n- **Light the lamp**\n- Open the door\n\n'
        + '| Person | Place |\n| --- | --- |\n| Keeper | Inn |' })
    await page.getByRole('heading', { name: 'Evening notes', exact: true }).waitFor()
    const formatted = page.locator('article [data-story-markdown]').last()
    expect(await formatted.locator('p').first().textContent()).toBe('Evening arrives.')
    expect(await formatted.locator('table').count()).toBe(1)
    expect(await formatted.locator('blockquote').count()).toBe(1)
    const spacing = await formatted.locator('p').nth(1).evaluate(element => ({
      top: Number.parseFloat(getComputedStyle(element).marginTop),
      height: element.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(element).lineHeight),
    }))
    expect(spacing.top).toBeGreaterThan(8)
    expect(spacing.height).toBeGreaterThan(spacing.line * 1.8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await formatted.screenshot({ path: fileURLToPath(new URL('../../../.tmp/story-markdown-reading.png', import.meta.url)) })
    expect(console.pageErrors).toEqual([])
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0]
    await page?.screenshot({ path: fileURLToPath(new URL('../../../.tmp/reading-layout-failure.png', import.meta.url)) })
    throw new Error(page === undefined ? 'Browser page closed' : await page.locator('body').innerText(), { cause: error })
  } finally {
    await browser.close()
    await scaffold.close()
    await rm(root, { recursive: true, force: true })
  }
})
