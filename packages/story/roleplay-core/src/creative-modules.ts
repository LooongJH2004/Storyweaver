/** Pure creative module definitions shared by author forms and the narrative authority. */
import { z } from 'zod'
import { contextSectionSchema, narrationLengthSchema, type ContextRecipe } from './context-recipe.ts'
import { RoleplayError } from './records.ts'

export const creativeModuleSchema = z.enum(['narrationLength', 'director.performance', 'actor.performance', 'director.reasoning-mode', 'actor.reasoning-mode'])
export type CreativeModule = z.infer<typeof creativeModuleSchema>
export const creativeModules = creativeModuleSchema.options
const valueSchema = z.union([narrationLengthSchema, contextSectionSchema, z.null()])
export type CreativeValue = z.infer<typeof valueSchema>
const bindingSchema = z.strictObject({ source: z.enum(['local', 'storybook', 'global']), localValue: valueSchema,
  appliedGlobalRevision: z.number().int().nonnegative().optional(), appliedGlobalValue: valueSchema.optional(),
  followPaused: z.boolean().optional() })
export const creativeBindingsSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  modules: z.record(creativeModuleSchema, bindingSchema) })
export type CreativeBindings = z.infer<typeof creativeBindingsSchema>
export const globalCreativeSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  modules: z.partialRecord(creativeModuleSchema, valueSchema), updatedAt: z.string() })
export type GlobalCreativeSettings = z.infer<typeof globalCreativeSchema>
/** Reject a value belonging to another module before it enters durable configuration. */
export function validateCreativeValue(key: CreativeModule, value: CreativeValue): void {
  if (value === null) {
    if (key.endsWith('.performance')) throw new RoleplayError('invalid', 'Creative instruction modules require a value; disable them explicitly instead')
    return
  }
  if (key === 'narrationLength') { narrationLengthSchema.parse(value); return }
  const section = contextSectionSchema.parse(value)
  if (section.id !== key.split('.')[1]) throw new RoleplayError('invalid', 'Creative module identity differs from its value')
}
export function creativeValue(recipe: ContextRecipe, key: CreativeModule): CreativeValue {
  if (key === 'narrationLength') return recipe.narrationLength ?? null
  const side = key.startsWith('director.') ? 'director' : 'actor'
  return recipe[side].find(section => section.id === key.split('.')[1]) ?? null
}
export function applyCreativeValue(recipe: ContextRecipe, key: CreativeModule, value: CreativeValue): ContextRecipe {
  validateCreativeValue(key, value)
  if (key === 'narrationLength') {
    const { narrationLength: _previous, ...rest } = recipe
    return value === null ? rest : { ...rest, narrationLength: narrationLengthSchema.parse(value) }
  }
  const side = key.startsWith('director.') ? 'director' : 'actor'
  const id = key.split('.')[1]
  const exists = recipe[side].some(section => section.id === id)
  const sections = recipe[side].flatMap(section => section.id !== id ? [section]
    : value === null ? [] : [contextSectionSchema.parse(value)])
  return { ...recipe, [side]: !exists && value !== null ? [...sections, contextSectionSchema.parse(value)] : sections }
}
