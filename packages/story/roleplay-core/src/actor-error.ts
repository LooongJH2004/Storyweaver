/** Stable failure taxonomy for the experimental Actor kernel. */

/** Codes callers may use without parsing an error message. */
export type ActorErrorCode =
  | 'ACTOR_ALREADY_BOUND'
  | 'ACTOR_CAPABILITY_REQUIRED'
  | 'ACTOR_INVALID_CONFIG'
  | 'ACTOR_INVALID_INPUT'
  | 'ACTOR_INVALID_SESSION'
  | 'ACTOR_LIMIT_REACHED'
  | 'ACTOR_NOT_BOUND'
  | 'ACTOR_NOT_LIVE'
  | 'ACTOR_STATE_CONFLICT'
  | 'ACTOR_TURN_CLOSED'
  | 'ACTOR_TURN_NOT_OPEN'

/** Domain rejection raised by an Actor or PlayerAuthority operation. */
export class ActorError extends Error {
  constructor(message: string, readonly code: ActorErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ActorError'
  }
}
