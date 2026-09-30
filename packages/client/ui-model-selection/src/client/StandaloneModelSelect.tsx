/** Reuse the native menu and host catalog for an owner-supplied execution selection. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelCatalogState } from './catalog.ts'
import { ModelSelectControl } from './ModelSelect.tsx'
import type {} from './slots.ts'

export interface StandaloneModelInjected {
  hooks: { catalog: HostObservable<ModelCatalogState> }
  load: () => void
}
/** The parent owns writes; the original model plugin owns catalog discovery and menu behavior. */
export function StandaloneModelSelect(props: PropsRuntime<'model.selection.control'> & InjectFace<StandaloneModelInjected> & PropsLocale<'model'>) {
  const catalog = props.useCatalog(value => value)
  return <ModelSelectControl locked={props.locked} available state={{
    current: props.current, routable: null,
    groups: catalog.value?.groups ?? [], failures: catalog.value?.failures ?? [],
    status: props.selecting ? 'selecting' : props.error ? 'error' : catalog.status,
    error: props.error ?? catalog.error,
  }} load={props.load} select={props.select} t={props.t} />
}
