import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and before hydration, true afterwards. Submit
 * buttons stay disabled until then, so a click can never fall through to a
 * native form submission (which would put field values in a URL).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
