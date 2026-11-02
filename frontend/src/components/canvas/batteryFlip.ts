import { createContext, useContext } from 'react'

function noopFlip(_id: string): void {
  /* Read-only contexts provide no flip. */
}

export const BatteryFlipContext = createContext<(id: string) => void>(noopFlip)

export function useBatteryFlip(): (id: string) => void {
  return useContext(BatteryFlipContext)
}
