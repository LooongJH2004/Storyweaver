# Agent Note: Storybook character state projection

Status: implemented

English | [中文](2026-08-29-storybook-character-state-projection.zh.md)

## Problem

The character panel originally listed only Stories with active private Actor Sessions. Director prose could name many fictional characters while the panel still showed zero because prose is not an Actor lifecycle event. A storybook also needs useful initial state before simulation starts, while a running Actor must later replace those initial values with its own durable choices.

AIAgentRolePlay demonstrates useful author flexibility by allowing arbitrary nested world and character state. Its browser recursively interprets that state and combines mutable world, psychology, and relationship objects. Reusing that arrangement would make browser rendering depend on storage structure and would let global state updates blur private knowledge ownership.

## Decision

`world/storybook.json` is the optional source of initial cast definitions. Story Controller validates the durable file and projects each character into the same browser-safe state value used for running Actors. A missing file means no configured cast; an invalid present file fails explicitly. Physical paths and raw JSON do not cross the Remote API.

Character state has two layers. Semantic fields cover emotions, beliefs, relationships, memories, goals, and intentions because those values participate in autonomous behavior and durable Actor events. A storybook may also define arbitrary `state` keys for location, equipment, injuries, posture, or scenario-specific facts. The Host flattens each extension into a labeled display facet, so the browser renders a stable list instead of recursively understanding author storage.

Every projected character has a lifecycle marker. `defined` means the card comes from the storybook. `active` means a private Actor Session with the same stable ActorId is running. Running Actor values override non-empty semantic initial fields; storybook extension facets remain visible because the current Actor event vocabulary does not own those values.

Private context remains visible only through the trusted player god-view request. Character models do not receive another character's facets, knowledge, blind spots, secrets, or memories from this projection.

The browser uses character-first navigation because information ownership belongs to an Actor, then category tabs split overview, mind, relationships, and memory/intent. Desktop users may resize the bounded panel, while compact screens use a stacked responsive layout.

## Alternatives considered

- **List only live Actor Sessions.** Rejected because an authored cast would remain invisible before autonomous Actors start, making storybook loading look broken.
- **Expose the raw nested storybook object to the browser.** Rejected because it would couple presentation to storage shape and obscure the boundary between private Actor state and shared world state.
- **Treat Director prose as character state.** Rejected because it would give the Director an indirect path to decide persistent-character actions and beliefs without Actor events.

## Consequences

The character panel can show a complete test cast before autonomous scheduling exists, and its count reflects configured characters rather than only private Sessions. Only one character and one state category occupy the detail surface at a time, which keeps large casts readable. Authors can add scenario-specific display state without a Client change. Actor autonomy remains event-backed instead of being replaced by a generic mutable JSON tree.

Director prose still does not update state automatically. A later world settlement capability must own location, injury, inventory, and other shared-world transitions, while Actor tools continue to own private semantic state. Automatic Actor creation and wake scheduling remain separate work.
