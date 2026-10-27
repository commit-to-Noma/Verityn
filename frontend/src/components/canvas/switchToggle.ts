import { createContext, useContext } from 'react'

function noopToggle(_id: string): void {
  /* Read-only contexts provide no toggle. */
}

export const SwitchToggleContext = createContext<(id: string) => void>(noopToggle)

export function useSwitchToggle(): (id: string) => void {
  return useContext(SwitchToggleContext)
}
