# Agent Note: User interruption actively settles streaming and subprocess work

Status: implemented

English | [中文](2026-09-01-interrupt-reaches-runtime-quiescence.zh.md)

## Problem

Stopping a turn aborted the agent phase, but two downstream operations could keep the Host event loop from promptly publishing the resulting idle state. A DeepSeek response whose headers had arrived could leave the SSE reader waiting indefinitely, which was particularly visible when Creator DSML content was buffered until completion. On Windows, subprocess cancellation synchronously ran `taskkill`, so the abort listener itself could block the cancel Remote and status frames. The UI then continued to look busy after the user interrupted the task.

## Decision

Cancellation actively settles both owned runtime resources:

- `dsh-llm-deepseek` passes the request `AbortSignal` into `parseSse`. The parser owns its transformed stream reader, cancels that reader on abort, removes the listener during cleanup, and rethrows the abort reason instead of classifying the interrupted stream as a truncated provider response.
- `dsh-subprocess-local` requests normal Windows process-tree termination with an asynchronous `taskkill` child. The synchronous `taskkillProcessTree` path remains reserved for Host process-exit finalization, where the event loop cannot be relied upon to complete asynchronous cleanup.
- Session Controller keeps a failed Stop response visible while the Host still reports the turn as running. An authoritative idle control frame clears that Stop error, including a reconnect baseline whose running bit was already false, because the requested outcome is then known to have landed even when the unary response was lost. A new Stop attempt also clears its older Stop error without erasing unrelated send failures.
- The change does not combine Creator and Story tool registries. Creator-only DSML fallback remains enabled only when the request carries a Creator terminal tool; Story Director and Actor requests keep their separate tool surface and native parsing behavior.

## Verification

The DeepSeek adapter tests interrupt a live Creator response after headers while its body remains open and require an `ABORTED` result without waiting for stream completion. Parser tests require abort to cancel the underlying reader. Session Controller tests require both a running-to-idle frame and an already-idle reconnect baseline to clear only an ambiguous Stop transport error. A separate isolation test feeds the same DSML payload to Creator and Story tool surfaces and requires only Creator to emit a tool call. Subprocess package typechecking covers the split normal-cancel and Host-exit hooks; platform-specific process tests continue to own process-tree behavior.

## Alternatives considered

**Treat the Stop button as a UI timeout and force the display idle.** This would hide live provider or subprocess work and allow late events to arrive after the interface claimed quiescence. The runtime resources must settle first so idle remains truthful.

**Keep a failed Stop response sticky after the Host reports idle.** The failed response proves only that the page did not receive an acknowledgement. Once the Host reports idle, retaining that error misrepresents current state and can make a continuable conversation appear blocked.

**Keep relying on `fetch` to propagate abort into the response body.** Provider and runtime implementations do not all settle a post-headers body read promptly, and transformed streams add another ownership layer. Explicitly cancelling the reader makes the adapter's ownership and cleanup deterministic.

**Run synchronous `taskkill` for every Windows cancellation.** It guarantees the command has returned before the listener exits, but it blocks the same Host event loop needed to acknowledge cancellation. Synchronous cleanup is retained only for process exit.

## Consequences

- Interrupting Creator work can return the session to idle even when the provider leaves a response body open or a Windows tool process is still being terminated.
- Normal Windows cancellation becomes a request followed by bounded liveness observation rather than a blocking OS call. Existing escalation and `waitForExit` behavior still determine whether the tree actually stopped.
- Host-exit cleanup remains synchronous and therefore retains its stronger best-effort process-tree finalization.
- A lost cancel acknowledgement can still show a transient error while the Host is running, but authoritative idle state restores interaction without requiring a reload.
- Creator and Story modes remain operationally isolated; the lifecycle fix changes resource cleanup, not tool availability or permissions.
