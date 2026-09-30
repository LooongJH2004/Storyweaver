import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { roleplayEventDefinition } from '../src/client/roleplay-event-definition.ts'

describe('roleplay browser plugin', () => {
  it('registers the roleplaying definitions, slots, locale, and theme layer', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const effects: (() => void)[] = []
    const registerDefinition = vi.fn()
    const registerLocale = vi.fn(() => vi.fn())
    const bindLocale = vi.fn(() => (key: string) => key)
    const overrideComposerPlaceholders = vi.fn((
      _owner: string,
      _placeholders: Record<string, () => string>,
    ) => vi.fn())
    const overrideTokens = vi.fn((_owner: string, _tokens: Record<string, unknown>) => vi.fn())
    const ctx = {
      get(name: string) {
        if (name === 'stories') return {
          actorStates: vi.fn().mockResolvedValue([]),
          storybook: vi.fn(),
          updateStorybook: vi.fn(),
          contextPreview: vi.fn(),
        }
        if (name === 'sessions') return (selector: (snapshot: unknown) => unknown) => selector({ byId: {} })
        return undefined
      },
      uiConversation: {
        events: { register: registerDefinition },
        overrideComposerPlaceholders,
      },
      locale: { register: registerLocale, bind: bindLocale },
      theme: { overrideTokens },
      effect(factory: () => (() => void), _label: string) {
        effects.push(factory())
      },
      slots: {
        inject(_name: string, factory: () => unknown) { return factory() },
        register(options: Record<string, unknown>, component: unknown) {
          registrations.push({ options, component })
          return vi.fn()
        },
      },
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'locale', 'uiConversation', 'theme', 'stories', 'sessions'])
    expect(registerDefinition).toHaveBeenCalledWith(roleplayEventDefinition)
    expect(registerLocale).toHaveBeenCalledOnce()
    expect(bindLocale).toHaveBeenCalledWith('roleplay')
    expect(overrideComposerPlaceholders).toHaveBeenCalledOnce()
    expect(overrideComposerPlaceholders.mock.calls[0]?.[0])
      .toBe('@deepseek-ai/dsh-experimental-client-ui-roleplay')
    expect(overrideTokens).toHaveBeenCalledOnce()
    expect(overrideTokens.mock.calls[0]?.[0])
      .toBe('@deepseek-ai/dsh-experimental-client-ui-roleplay')
    const tokens = overrideTokens.mock.calls[0]?.[1] as Record<
      string,
      { readonly light: string; readonly dark: string }
    >
    expect(tokens['--dsw-alias-bg-base']).toEqual({
      light: 'rgb(252, 250, 247)',
      dark: 'rgb(22, 19, 28)',
    })
    expect(tokens['--dsw-specific-sidebar-fill']).toEqual({
      light: 'rgb(246, 242, 236)',
      dark: 'rgb(30, 26, 37)',
    })
    expect(tokens['--dsw-roleplay-accent']).toEqual({
      light: 'rgb(116, 82, 190)',
      dark: 'rgb(183, 148, 246)',
    })
    expect(registrations.map(entry => entry.options.name)).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'conversation.hero.brand.mark',
      'conversation.hero.headline',
      'conversation.hero.badge',
      'conversation.hero.guidance',
      'conversation.session.header.utilities',
      'conversation.session.header.utilities',
      'conversation.session.header.utilities',
      'conversation.input.dock',
      'conversation.chat.node',
      'conversation.chat.node',
      'conversation.chat.node',
      'conversation.chat.node',
    ])
    expect(registrations.at(-3)?.options).toMatchObject({ key: 'roleplay-event', locale: 'roleplay' })
    expect(registrations.at(-2)?.options).toMatchObject({ key: 'roleplay-actor-attempt', locale: 'roleplay' })
    expect(registrations.at(-1)?.options).toMatchObject({
      key: 'turn-error', priority: -10, locale: 'roleplay',
    })
    expect(effects).toHaveLength(3)
  })
})
