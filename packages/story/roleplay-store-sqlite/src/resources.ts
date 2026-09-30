/** Host byte verification for portable narrative resources; no files are written here. */
import { createHash } from 'node:crypto'
import type { ResourceVerifier } from '@deepseek-ai/dsh-roleplay-core'

/** Validate resource bytes and paths before they become immutable published content. */
export const embeddedResourceVerifier: ResourceVerifier = {
  verify(resources) {
    const paths = new Set<string>()
    for (const resource of resources) {
      const parts = resource.path.split('/')
      if (parts.some(part => part === '' || part === '.' || part === '..' || /[<>:"\\|?*\u0000-\u001f]/u.test(part)
        || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
        throw new Error('Resource path must be a portable relative path')
      }
      const key = resource.path.normalize('NFC').toLowerCase()
      if (paths.has(key)) throw new Error('Resource package repeats a path')
      paths.add(key)
      const bytes = Buffer.from(resource.base64, 'base64')
      if (bytes.toString('base64') !== resource.base64) throw new Error('Resource bytes are not canonical base64')
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (resource.digest !== digest) throw new Error('Resource digest does not match its bytes')
    }
  },
}
