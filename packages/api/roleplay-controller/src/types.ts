/** Browser command coordinates contain no execution authority. */
import type { InstanceId, CommandId, PlayAudience } from '@deepseek-ai/dsh-roleplay-core/types'

/** The authenticated browser supplies revision and retry coordinates, never its authority. */
export interface PlayerCommand {
  readonly instanceId: InstanceId
  readonly commandId: CommandId
  readonly expectedRevision: number
}


/** A stream fixes its audience and page; historical requests remain ordinary point queries. */
export interface PlayFollowRequest {
  readonly instanceId: InstanceId
  readonly audience: PlayAudience
  readonly offset: number
  readonly limit: number
}
