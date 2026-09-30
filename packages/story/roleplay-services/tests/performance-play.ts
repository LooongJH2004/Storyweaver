/** Collect every row from a frozen evaluation view without treating a short page as completion. */
export function performanceRows<Row>(read: (offset: number) => { rows: readonly Row[]; total: number }): Row[] {
  const first = read(0)
  const rows = [...first.rows]
  while (rows.length < first.total) {
    const page = read(rows.length)
    if (page.total !== first.total || page.rows.length === 0) throw new Error('Evaluation play pagination is incomplete')
    rows.push(...page.rows)
  }
  if (rows.length !== first.total) throw new Error('Evaluation play pagination exceeds its total')
  return rows
}
