/** Two-sample compare selection: toggle in, cap at two, a third pick retires the oldest. */
export function toggleCompare(selected: string[], id: string): string[] {
  if (selected.includes(id)) {
    return selected.filter((entry) => entry !== id)
  }
  if (selected.length < 2) {
    return [...selected, id]
  }
  return [selected[1] as string, id]
}
