/** Real browser player inputs publish separate behaviors and expose AI handback. */
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
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

class RecordedPlayerMock extends MockAdapter {
  override reconstructRequest(options: GenerateOptions): string { return JSON.stringify(options) }
}

it('persists two player fields, submits their separate behaviors, and returns the protagonist to AI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyweaver-performance-browser-'))
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
      document: { schemaVersion: 6, id: 'ledger', title: 'Independent Ledger', protagonistActorId: 'keeper', directorPrompt: '', directorGuidance: {},
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
    scaffold.ctx.roleplayPeople.stage({ instanceId: instance.id, id: 'player-stage' as CommandId,
      expectedRevision: 0, principal: { kind: 'player' } }, { id: 'inn', location: 'Quiet inn', present: ['keeper'], appearances: [] })
    await page.getByText('Quiet inn', { exact: true }).waitFor()
    const control = page.getByRole('combobox', { name: 'Player control', exact: true })
    await control.selectOption('keeper')
    const speech = page.getByRole('textbox', { name: 'What you say', exact: true })
    const action = page.getByRole('textbox', { name: 'What you do', exact: true })
    await speech.fill('Please wait here.')
    await action.fill('I check the door latch.')
    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => speech.inputValue()).toBe('Please wait here.')
    await expect.poll(() => action.inputValue()).toBe('I check the door latch.')
    const composer = page.getByRole('form', { name: 'Player action or direction', exact: true })
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/player-two-inputs.png', import.meta.url)) })
    await composer.locator('button[type="submit"]').click()
    await expect.poll(() => speech.inputValue()).toBe('')
    await expect.poll(() => action.inputValue()).toBe('')
    const behaviors = scaffold.ctx.roleplayHistory.snapshot(instance.id).entities.filter(item => item.key.collection === 'behavior')
      .map(item => item.value as { behavior: unknown; origin: string; order: number }).sort((a, b) => a.order - b.order)
    expect(behaviors).toMatchObject([
      { origin: 'player', behavior: { kind: 'speech', text: 'Please wait here.', to: [], delivery: 'spoken' } },
      { origin: 'player', behavior: { kind: 'action', attempt: 'I check the door latch.' } },
    ])
    await action.fill('Keep this action draft.')
    await page.getByRole('button', { name: 'Hand back to AI', exact: true }).click()
    await expect.poll(() => control.inputValue()).toBe('')
    await page.getByRole('textbox', { name: 'Player action or direction', exact: true }).waitFor()
    expect(await composer.locator('small').filter({ hasText: 'AI plays all characters' }).count()).toBe(1)
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id).entities.find(item => item.key.collection === 'player-control')?.value)
      .toMatchObject({ actorId: null })
    await control.selectOption('keeper')
    await expect.poll(() => action.inputValue()).toBe('Keep this action draft.')
    await page.setViewportSize({ width: 390, height: 844 })
    await speech.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect((await speech.boundingBox())!.width).toBeLessThan(390)
    await action.fill('')
    await page.getByLabel('Delivery', { exact: true }).selectOption('whispered')
    await speech.fill('A private word.')
    expect(await composer.locator('button[type="submit"]').isEnabled()).toBe(false)
    await speech.fill('')
    await action.fill('I wait quietly.')
    expect(await composer.locator('button[type="submit"]').isEnabled()).toBe(true)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const adapter = new RecordedPlayerMock([...['initial', 'rewritten'].map(id => toolCallResponse(id, 'director_command',
      { command: { operation: 'finish', actors: [], advanceDiscussion: false } })),
    toolCallResponse('short', 'director_observe', { settles: [], summary: 'Rain', content: 'Rain wets the sill.',
      narration: '雨落窗边。', deliveries: [], state: [] }),
    toolCallResponse('append', 'director_revise_narration', { draftRevision: 0, mode: 'append', narration: '水珠顺着木框慢慢滚落。' }),
    toolCallResponse('finish-length', 'director_command', { command: { operation: 'finish', actors: [], advanceDiscussion: false } })])
    scaffold.ctx.llm.registerAdapter(['mock'], adapter)
    await page.getByRole('button', { name: 'Hand back to AI', exact: true }).click()
    await page.getByRole('textbox', { name: 'Player action or direction', exact: true }).fill('Open the next scene.')
    await composer.locator('button[type="submit"]').click()
    await expect.poll(() => adapter.requests.length).toBe(1)
    await expect.poll(() => composer.locator('button[type="submit"]').isEnabled()).toBe(true)
    await page.getByRole('button', { name: 'Context', exact: true }).click()
    await page.getByRole('heading', { name: 'Author workspace', exact: true }).waitFor()
    const audience = page.getByRole('combobox', { name: 'Context recipe', exact: true })
    await audience.selectOption('director')
    const creative = page.getByRole('textbox', { name: 'Creative and pacing instructions (editable)', exact: true })
    await expect.poll(() => creative.inputValue()).toContain('500–900')
    await creative.fill('Write 1000–1500 characters and resolve the immediate obstacle.')
    await page.getByRole('checkbox', { name: 'Check length and expand automatically', exact: true }).check()
    await page.getByRole('spinbutton', { name: 'Minimum characters', exact: true }).fill('12')
    await page.getByRole('spinbutton', { name: 'Target characters', exact: true }).fill('20')
    const recipeForm = creative.locator('xpath=ancestor::form')
    await page.getByText('These edits are not saved and will not be used for generation. Save before sending or rewriting.', { exact: true }).first().waitFor()
    await recipeForm.getByRole('button', { name: 'Save and apply to subsequent requests', exact: true }).first().click()
    await expect.poll(() => recipeForm.getByRole('status').last().textContent()).toBe('Saved')
    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => creative.inputValue()).toBe('Write 1000–1500 characters and resolve the immediate obstacle.')
    await page.getByRole('button', { name: 'Preview narrative context for this turn', exact: true }).click()
    await page.getByRole('heading', { name: 'Narrative messages from the saved recipe', exact: true }).waitFor()
    await expect.poll(() => page.locator('pre:visible').filter({ hasText: 'Write 1000–1500 characters' }).count()).toBe(1)
    await creative.scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/editable-creative-rules.png', import.meta.url)) })
    await audience.selectOption('actor')
    await expect.poll(() => creative.inputValue()).toContain('3–10')
    await creative.locator('xpath=ancestor::details').getByRole('checkbox', { name: 'Enabled', exact: true }).uncheck()
    await recipeForm.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => recipeForm.getByRole('status').last().textContent()).toBe('Saved')
    expect(scaffold.ctx.roleplayViews.actorContext({ instanceId: instance.id, actorId: 'keeper', query: '' }).sections.some(item => item.id === 'performance')).toBe(false)
    expect(scaffold.ctx.roleplayDirectorViews.context({ instanceId: instance.id, instruction: '' }).sections.find(item => item.id === 'performance')?.content)
      .toBe('Write 1000–1500 characters and resolve the immediate obstacle.')
    await page.getByRole('button', { name: 'Back to story', exact: true }).click()
    await page.getByRole('button', { name: 'Edit player direction', exact: true }).click()
    await page.getByRole('textbox', { name: 'Edit player direction', exact: true }).fill('Open the next scene with more detail.')
    await page.getByRole('button', { name: 'Save and resend', exact: true }).click()
    await expect.poll(() => adapter.requests.length).toBe(2)
    expect(JSON.stringify(adapter.requests[1])).toContain('Write 1000–1500 characters')
    expect(JSON.stringify(adapter.requests[1])).not.toContain('500–900')
    expect(JSON.stringify(adapter.requests[1])).toContain('最低 12 字，目标 20 字')
    await expect.poll(() => composer.locator('button[type="submit"]').isEnabled()).toBe(true)
    await page.getByRole('button', { name: 'Context', exact: true }).click()
    await audience.selectOption('director')
    await expect.poll(() => creative.inputValue()).toBe('Write 1000–1500 characters and resolve the immediate obstacle.')
    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => creative.inputValue()).toBe('Write 1000–1500 characters and resolve the immediate obstacle.')
    expect(await page.getByRole('spinbutton', { name: 'Minimum characters', exact: true }).inputValue()).toBe('12')
    expect(await page.getByRole('checkbox', { name: 'Check length and expand automatically', exact: true }).isChecked()).toBe(true)
    await page.getByRole('group', { name: 'Narration length', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/narration-length-settings.png', import.meta.url)) })
    await page.getByRole('button', { name: 'Back to story', exact: true }).click()
    await page.getByRole('textbox', { name: 'Player action or direction', exact: true }).fill('Describe the rain.')
    await composer.locator('button[type="submit"]').click()
    await expect.poll(() => adapter.requests.length).toBe(5)
    await expect.poll(() => composer.locator('button[type="submit"]').isEnabled()).toBe(true)
    await page.getByText('水珠顺着木框慢慢滚落。', { exact: true }).waitFor()
    expect(await page.locator('[data-kind="narration"]').count()).toBe(1)
    scaffold.ctx.roleplayWorld.observe({ instanceId: instance.id, id: 'reader-layout' as CommandId,
      expectedRevision: scaffold.ctx.roleplayHistory.snapshot(instance.id).instance.revision, principal: { kind: 'player' } },
    { summary: 'A note', content: 'A note is on the counter.', narration: 'A note is on the counter.', deliveries: [], state: [] })
    await page.getByRole('button', { name: 'Original context', exact: true }).last().click()
    const requestDialog = page.getByRole('dialog')
    await requestDialog.getByText('Recorded request input', { exact: true }).waitFor()
    const requestSteps = requestDialog.getByRole('navigation', { name: 'Request steps', exact: true })
    const modalBody = requestDialog.locator('[data-modal-body]')
    const originalViewport = page.viewportSize()!
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await modalBody.evaluate((element) => { element.scrollTop = 0 })
      const geometry = await requestSteps.evaluate(element => ({
        direction: getComputedStyle(element).flexDirection, position: getComputedStyle(element).position,
        bottom: element.getBoundingClientRect().bottom, left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }))
      expect(geometry.direction).toBe('row')
      expect(geometry.position).toBe('static')
      const reading = requestDialog.getByRole('tablist')
      expect((await reading.boundingBox())!.y).toBeGreaterThanOrEqual(geometry.bottom)
      const bodyBox = (await modalBody.boundingBox())!
      expect(geometry.left).toBeGreaterThanOrEqual(bodyBox.x)
      expect(geometry.right).toBeLessThanOrEqual(bodyBox.x + bodyBox.width)
      await modalBody.evaluate((element, distance) => { element.scrollTop = distance }, geometry.bottom - bodyBox.y + 150)
      await expect.poll(async () => (await requestSteps.boundingBox())!.y + (await requestSteps.boundingBox())!.height)
        .toBeLessThanOrEqual(bodyBox.y)
    }
    await page.setViewportSize(originalViewport)
    await modalBody.evaluate((element) => { element.scrollTop = 0 })
    await modalBody.evaluate((element) => { element.scrollTop = 320 })
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/request-list-scrolled.png', import.meta.url)) })
    await page.keyboard.press('Escape')
    const usageBefore = scaffold.ctx.roleplayHistory.snapshot(instance.id)
    const cumulative = await scaffold.ctx.roleplayExecutionHistory.usage(instance.id)
    expect(cumulative.stats.steps).toBeGreaterThan(0)
    const statistics = page.getByLabel('Story cumulative usage', { exact: true })
    await statistics.getByText(`${cumulative.stats.turns} turns · ${cumulative.stats.steps} steps`, { exact: true }).waitFor()
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id)).toEqual(usageBefore)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/story-usage-desktop.png', import.meta.url)) })
    await page.reload({ waitUntil: 'load' })
    await statistics.getByText(`${cumulative.stats.turns} turns · ${cumulative.stats.steps} steps`, { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Context synchronization', exact: true }).click()
    await page.getByRole('heading', { name: 'Book-shared settings', exact: true }).waitFor()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('button', { name: 'New book defaults', exact: true }).click()
    const beforeDefaults = scaffold.ctx.roleplayHistory.snapshot(instance.id)
    const beforeBook = scaffold.ctx.roleplayBooks.draft(draft.id)
    await page.locator('summary').filter({ hasText: /^System initial context$/u }).click()
    const systemEditor = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^System initial context$/u }) }).first()
    await systemEditor.getByRole('button', { name: 'Actor', exact: true }).click()
    const systemText = systemEditor.getByRole('textbox', { name: 'Creative and pacing instructions (editable)', exact: true })
    await expect.poll(() => systemText.inputValue()).toContain('3–10')
    await systemText.fill('Keep each character distinct. Act on the immediate opportunity.')
    await systemEditor.getByRole('button', { name: 'Save system initial context', exact: true }).click()
    await systemEditor.getByText('Saved for subsequently created books only.', { exact: true }).waitFor()
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id)).toEqual(beforeDefaults)
    expect(scaffold.ctx.roleplayBooks.draft(draft.id)).toEqual(beforeBook)
    expect(scaffold.ctx.roleplayCreative.global(draft.id).revision).toBe(0)
    await page.reload({ waitUntil: 'load' })
    await page.locator('summary').filter({ hasText: /^System initial context$/u }).click()
    await systemEditor.getByRole('button', { name: 'Actor', exact: true }).click()
    await expect.poll(() => systemText.inputValue()).toContain('Keep each character distinct.')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/system-context-defaults.png', import.meta.url)) })
    await page.locator('summary').filter({ hasText: /^System initial context$/u }).click()
    await page.getByRole('dialog', { name: 'New book defaults', exact: true }).getByRole('button', { name: 'Close panel', exact: true }).click()
    await page.getByRole('button', { name: 'Edit shared settings', exact: true }).click()
    await page.locator('summary').filter({ hasText: /^Narration length/u }).click()
    await page.getByRole('checkbox', { name: 'Check length and expand automatically', exact: true }).check()
    await page.getByRole('spinbutton', { name: 'Minimum characters', exact: true }).fill('20')
    await page.getByRole('spinbutton', { name: 'Target characters', exact: true }).fill('30')
    await page.locator('summary').filter({ hasText: /^Actor creative instructions/u }).click()
    await page.getByRole('textbox', { name: 'Actor creative instructions', exact: true }).fill('Distinct voices from shared settings.')
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: 'Edit shared settings', exact: true }).click()
    await page.locator('summary').filter({ hasText: /^Narration length/u }).click()
    await expect.poll(() => page.getByRole('spinbutton', { name: 'Target characters', exact: true }).inputValue()).toBe('30')
    expect(scaffold.ctx.roleplayCreative.global(draft.id).revision).toBe(0)
    await page.getByRole('button', { name: 'Save 2 settings to book sharing', exact: true }).click()
    await expect.poll(() => scaffold.ctx.roleplayCreative.global(draft.id).revision).toBe(1)
    expect(scaffold.ctx.roleplayCreative.global(draft.id).modules.narrationLength).toMatchObject({ minimum: 20, target: 30 })
    await page.getByRole('dialog', { name: 'Edit shared settings', exact: true }).getByRole('button', { name: 'Close panel', exact: true }).click()
    // A retained shared draft must not block syncing the reviewed, saved version.
    await page.getByRole('button', { name: 'Edit shared settings', exact: true }).click()
    await page.locator('summary').filter({ hasText: /^Narration length/u }).click()
    await page.getByRole('spinbutton', { name: 'Target characters', exact: true }).fill('90')
    await page.getByRole('dialog', { name: 'Edit shared settings', exact: true }).getByRole('button', { name: 'Close panel', exact: true }).click()
    const beforeSync = scaffold.ctx.roleplayHistory.snapshot(instance.id)
    const from = page.getByRole('region', { name: 'Sync from', exact: true })
    const to = page.getByRole('region', { name: 'Sync to', exact: true })
    await from.getByRole('checkbox', { name: 'Narration length', exact: true }).check()
    await from.getByRole('checkbox', { name: 'Actor creative instructions', exact: true }).check()
    const fromBox = (await from.boundingBox())!, toBox = (await to.boundingBox())!
    expect(fromBox.x + fromBox.width).toBeLessThan(toBox.x)
    expect(Math.abs(fromBox.y - toBox.y)).toBeLessThan(2)
    expect(await page.locator('body').innerText()).not.toContain('Share five settings:')
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/context-sync-transfer-desktop.png', import.meta.url)) })
    await page.getByRole('button', { name: 'Preview: Narration length', exact: true }).click()
    const previewDialog = page.getByRole('dialog', { name: 'Narration length', exact: true })
    await previewDialog.getByText('Minimum 20 characters; target 30 characters', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await previewDialog.waitFor({ state: 'detached' })
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id)).toEqual(beforeSync)
    await page.getByRole('checkbox', { name: 'Follow future shared updates', exact: true }).check()
    await page.getByRole('button', { name: 'Sync saved settings (2)', exact: false }).click()
    await expect.poll(() => scaffold.ctx.roleplayCreative.read(instance.id).bindings.modules.narrationLength.source).toBe('global')
    expect(scaffold.ctx.roleplayCreative.read(instance.id).bindings.modules['actor.performance'].source).toBe('global')
    expect(scaffold.ctx.roleplayHistory.snapshot(instance.id).instance.revision).toBe(beforeSync.instance.revision + 1)
    expect(scaffold.ctx.roleplayCreative.read(instance.id).recipe.narrationLength?.target).toBe(30)
    expect(scaffold.ctx.roleplayCreative.global(draft.id).revision).toBe(1)
    await from.getByRole('button', { name: 'Continue editing', exact: true }).click()
    await page.locator('summary').filter({ hasText: /^Narration length/u }).click()
    await expect.poll(() => page.getByRole('spinbutton', { name: 'Target characters', exact: true }).inputValue()).toBe('90')
    await page.getByRole('dialog', { name: 'Edit shared settings', exact: true }).getByRole('button', { name: 'Close panel', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(async () => (await from.boundingBox())!.width).toBeGreaterThan(250)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const mobileFrom = (await from.boundingBox())!, mobileTo = (await to.boundingBox())!
    expect(mobileTo.y).toBeGreaterThan(mobileFrom.y + mobileFrom.height)
    await page.screenshot({ path: fileURLToPath(new URL('../../../.tmp/context-sync-transfer-mobile.png', import.meta.url)), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'Restore another source…', exact: true }).click()
    const changeNarration = page.getByRole('button', { name: 'Change: Narration length', exact: true })
    const syncDialog = page.getByRole('dialog', { name: 'Change: Narration length', exact: true })
    // One-time copying must stop following; restoring a local value must preview the retained backup.
    await changeNarration.click()
    await syncDialog.getByRole('radio', { name: /^Restore previous independent value/u }).check()
    await syncDialog.getByText('Minimum 12 characters; target 20 characters', { exact: true }).waitFor()
    await syncDialog.getByRole('button', { name: 'Restore previous independent value', exact: true }).click()
    await syncDialog.waitFor({ state: 'detached' })
    await expect.poll(() => scaffold.ctx.roleplayCreative.read(instance.id).recipe.narrationLength?.minimum).toBe(12)
    await changeNarration.click()
    await syncDialog.getByRole('radio', { name: /^Copy shared value and use independently/u }).check()
    await syncDialog.getByRole('button', { name: 'Copy shared value and use independently', exact: true }).click()
    await syncDialog.waitFor({ state: 'detached' })
    expect(scaffold.ctx.roleplayCreative.read(instance.id).bindings.modules.narrationLength.source).toBe('local')
    expect(scaffold.ctx.roleplayCreative.read(instance.id).recipe.narrationLength?.minimum).toBe(20)
    await page.getByRole('dialog', { name: 'Restore another source…', exact: true }).getByRole('button', { name: 'Close panel', exact: true }).click()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByRole('button', { name: 'Context', exact: true }).click()
    await audience.selectOption('director')
    const minimum = page.getByRole('spinbutton', { name: 'Minimum characters', exact: true })
    await expect.poll(() => minimum.inputValue()).toBe('20')
    expect(await minimum.isEnabled()).toBe(true)
    expect(await page.getByRole('combobox', { name: /Configuration source/u }).count()).toBe(0)
    await page.getByRole('button', { name: 'Manage book context synchronization', exact: true }).click()
    await page.getByRole('heading', { name: 'Book-shared settings', exact: true }).waitFor()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('button', { name: 'Copy into book draft', exact: true }).click()
    await page.getByRole('dialog', { name: 'Copy into book draft', exact: true })
      .getByRole('checkbox', { name: 'Narration length', exact: true }).check()
    const bookBeforeCopy = scaffold.ctx.roleplayBooks.draft(draft.id)
    await page.getByRole('button', { name: 'Copy 1 settings and review book draft', exact: true }).click()
    expect(scaffold.ctx.roleplayBooks.draft(draft.id)).toEqual(bookBeforeCopy)
    await page.getByRole('button', { name: 'Context recipe', exact: true }).click()
    await expect.poll(() => minimum.inputValue()).toBe('20')
    expect(console.pageErrors).toEqual([])
  } catch (error) {
    await browser.contexts()[0]?.pages()[0]?.screenshot({ path: fileURLToPath(new URL('../../../.tmp/player-input-failure.png', import.meta.url)) })
    throw error
  } finally {
    await browser.close()
    await scaffold.close()
    await rm(root, { recursive: true, force: true })
  }
})
