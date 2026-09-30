/**
 * Host-only Storyweaver storage root and managed per-story directory layout.
 * Browser contracts receive Story ids, never these physical paths.
 * @module @deepseek-ai/dsh-story-home
 */

import { cp, mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, posix, win32 } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Environment variable overriding the fixed Storyweaver data root. */
export const STORYWEAVER_HOME_ENV = 'STORYWEAVER_HOME'
/** Product data directory name under the operating-system application-data root. */
export const STORYWEAVER_HOME_DIR_NAME = 'Storyweaver'

/** Top-level directories managed below the Storyweaver home. */
export type StoryHomeArea = 'attachments' | 'sessions' | 'storages' | 'stories' | 'trash'

/** Story Home plugin configuration. */
export interface Config {
  /** Explicit storage root; omitted follows STORYWEAVER_HOME then the OS application-data location. */
  readonly root?: string
}

/** Story Home configuration schema. */
export const Config: z<Config> = z.object({ root: z.string() })

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only physical storage boundary for Storyweaver data. */
    storyHome: StoryHome
  }
}

/**
 * Resolve the operating-system default Storyweaver root.
 * @param env - Environment mapping used for platform application-data overrides.
 * @param platform - Node platform identifier.
 * @param userHome - User home used when the platform variable is absent.
 * @returns an absolute default root.
 */
export function defaultStoryweaverHome(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): string {
  const paths = platform === 'win32' ? win32 : posix
  if (platform === 'win32') {
    const local = nonBlank(env.LOCALAPPDATA) ?? paths.join(userHome, 'AppData', 'Local')
    return paths.resolve(local, STORYWEAVER_HOME_DIR_NAME)
  }
  if (platform === 'darwin') {
    return paths.resolve(userHome, 'Library', 'Application Support', STORYWEAVER_HOME_DIR_NAME)
  }
  const data = nonBlank(env.XDG_DATA_HOME) ?? paths.join(userHome, '.local', 'share')
  return paths.resolve(data, STORYWEAVER_HOME_DIR_NAME)
}

/**
 * Resolve the Storyweaver data root without consulting the process cwd.
 * @param configured - Explicit plugin configuration, with highest precedence.
 * @param env - Environment mapping used for STORYWEAVER_HOME and platform defaults.
 * @param platform - Node platform identifier.
 * @param userHome - User home used by the default resolver.
 * @returns an absolute storage root.
 */
export function resolveStoryweaverHome(
  configured?: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): string {
  const paths = platform === 'win32' ? win32 : posix
  const selected = nonBlank(configured)
    ?? nonBlank(env[STORYWEAVER_HOME_ENV])
    ?? defaultStoryweaverHome(env, platform, userHome)
  return paths.resolve(expandHome(selected, userHome, (...segments) => paths.join(...segments)))
}

/**
 * Validate a Story id before it participates in a filesystem path.
 * @param id - Story identity from a trusted domain record or decoded request.
 * @returns the same id as a plain string.
 */
export function validateStoryPathId(id: string): string {
  if (!/^story-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
    throw new Error(`invalid Story id for managed path: ${JSON.stringify(id)}`)
  }
  return id
}

/** Host service owning the one physical root and every managed story directory. */
export class StoryHome extends Service {
  static Config = Config

  /** Absolute fixed Storyweaver data root. */
  readonly root: string

  /**
   * @param ctx - Host Cordis context.
   * @param config - Optional explicit root.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'storyHome')
    this.root = resolveStoryweaverHome(config.root)
  }

  /** Create the fixed top-level layout before dependent services activate. */
  protected async [Service.init](): Promise<void> {
    await Promise.all((['attachments', 'sessions', 'storages', 'stories', 'trash'] as const)
      .map(area => mkdir(this.path(area), { recursive: true, mode: 0o700 })))
  }

  /**
   * Resolve one controlled top-level data path.
   * @param area - Managed top-level area.
   * @param segments - Additional trusted path segments.
   * @returns an absolute path below the Storyweaver root.
   */
  path(area: StoryHomeArea, ...segments: readonly string[]): string {
    validateSegments(segments)
    return join(this.root, area, ...segments)
  }

  /**
   * Resolve one managed story path from its opaque identity.
   * @param storyId - Valid Story id.
   * @param segments - Additional trusted path segments.
   * @returns an absolute path below stories/<StoryId>.
   */
  storyPath(storyId: string, ...segments: readonly string[]): string {
    validateSegments(segments)
    return this.path('stories', validateStoryPathId(storyId), ...segments)
  }

  /**
   * Ensure the physical aggregate skeleton for a Story exists.
   * @param storyId - Story identity.
   * @returns resolution after every directory exists.
   */
  async ensureStory(storyId: string): Promise<void> {
    await Promise.all([
      this.storyPath(storyId),
      this.storyPath(storyId, 'assets'),
      this.storyPath(storyId, 'exports'),
      this.storyPath(storyId, 'world'),
      this.storyPath(storyId, '.runtime'),
    ].map(path => mkdir(path, { recursive: true, mode: 0o700 })))
  }

  /**
   * Copy only player-authored baseline material into a fresh Story aggregate.
   * Runtime, exports, and prior Session state are deliberately excluded.
   * @param sourceStoryId - Story whose authored setting is reused.
   * @param targetStoryId - Fresh Story receiving that setting.
   */
  async copyBaseline(sourceStoryId: string, targetStoryId: string): Promise<void> {
    await this.ensureStory(targetStoryId)
    await Promise.all((['assets', 'world'] as const).map(area => cp(
      this.storyPath(sourceStoryId, area),
      this.storyPath(targetStoryId, area),
      { recursive: true, force: true },
    )))
  }

  /**
   * Move one managed Story aggregate into the application trash.
   * @param storyId - Story whose managed directory is removed from active storage.
   * @returns the opaque trash entry used for rollback when a registry write fails.
   */
  async trashStory(storyId: string): Promise<string> {
    const accepted = validateStoryPathId(storyId)
    const entry = `${accepted}-${Date.now()}`
    await rename(this.storyPath(accepted), this.path('trash', entry))
    return entry
  }

  /**
   * Restore a just-staged Story deletion after its canonical registry write failed.
   * @param storyId - Original Story identity.
   * @param trashEntry - Exact entry returned by {@link trashStory}.
   */
  async restoreTrashedStory(storyId: string, trashEntry: string): Promise<void> {
    validateStoryPathId(storyId)
    validateSegments([trashEntry])
    await rename(this.path('trash', trashEntry), this.storyPath(storyId))
  }

  /**
   * Write the human-readable derived Story manifest. Canonical state remains
   * in the Story domain; startup can regenerate this file at any time.
   * @param storyId - Story identity.
   * @param manifest - JSON-safe public Story metadata.
   * @returns resolution after the manifest is replaced.
   */
  async writeManifest(storyId: string, manifest: object): Promise<void> {
    await this.ensureStory(storyId)
    await writeFile(
      this.storyPath(storyId, 'story.json'),
      `${JSON.stringify(manifest, undefined, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )
  }
}

function nonBlank(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined
}

function expandHome(path: string, userHome: string, joinPath: (...parts: string[]) => string): string {
  if (path === '~') return userHome
  if (path.startsWith('~/') || path.startsWith('~\\')) return joinPath(userHome, path.slice(2))
  return path
}

function validateSegments(segments: readonly string[]): void {
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..' || isAbsolute(segment)
      || segment.includes('/') || segment.includes('\\')) {
      throw new Error(`invalid managed Storyweaver path segment: ${JSON.stringify(segment)}`)
    }
  }
}

export default StoryHome
