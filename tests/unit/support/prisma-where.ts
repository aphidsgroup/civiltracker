/**
 * Minimal in-memory evaluator for the Prisma `where` shapes the approval code composes.
 *
 * A bare `vi.fn()` delegate ignores its `where`, so a test can only assert that a
 * predicate was *passed*. Backing the delegates with this evaluator makes a test prove
 * that the predicate actually *excludes* the row — a deleted site, a broken entity link
 * or a cross-tenant record disappears because the query says so.
 *
 * Deliberately strict: any operator it does not know throws, so production code that
 * starts relying on an unmodelled filter fails the test loudly instead of silently
 * matching everything.
 */
export type Row = Record<string, unknown>

/** Resolves a to-one relation of `row` by field name; `undefined` means "not a relation". */
export type RelationResolver = (row: Row, key: string) => Row | null | undefined

const noRelations: RelationResolver = () => undefined

function sameValue(value: unknown, expected: unknown) {
  if (expected instanceof Date) return value instanceof Date && value.getTime() === expected.getTime()
  return value === expected
}

function matchesScalar(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined
  if (typeof condition !== 'object' || condition instanceof Date) return sameValue(value, condition)

  return Object.entries(condition as Row).every(([operator, operand]) => {
    switch (operator) {
      case 'equals':
        return matchesScalar(value, operand)
      case 'in':
        return (operand as unknown[]).some((candidate) => sameValue(value, candidate))
      case 'not':
        return !matchesScalar(value, operand)
      case 'gte':
        return value != null && (value as number | Date) >= (operand as number | Date)
      case 'contains':
        return String(value ?? '').toLowerCase().includes(String(operand).toLowerCase())
      case 'mode':
        return true
      default:
        throw new Error(`prisma-where: unsupported scalar operator "${operator}"`)
    }
  })
}

export function matchesWhere(row: Row, where: Row | undefined, relation: RelationResolver = noRelations): boolean {
  if (!where) return true

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((branch) => matchesWhere(row, branch, relation))
    if (key === 'AND') return (condition as Row[]).every((branch) => matchesWhere(row, branch, relation))
    if (key === 'NOT') return !matchesWhere(row, condition as Row, relation)

    const related = relation(row, key)
    if (related !== undefined) {
      const filter = condition as Row
      if ('is' in filter) {
        if (filter.is === null) return related === null
        return related !== null && matchesWhere(related, filter.is as Row, relation)
      }
      if ('isNot' in filter) {
        if (filter.isNot === null) return related !== null
        return related === null || !matchesWhere(related, filter.isNot as Row, relation)
      }
      return related !== null && matchesWhere(related, filter, relation)
    }

    return matchesScalar(row[key], condition)
  })
}

type FindArgs = { where?: Row; take?: number }

/**
 * Builds find/count/update implementations over a fixed row set. Rows are returned as
 * stored: `select`/`include` are not modelled because the assertions are about which
 * rows a query admits, not which columns it projects.
 */
export function inMemoryDelegate(rows: Row[], relation: RelationResolver = noRelations) {
  const filter = (where?: Row) => rows.filter((row) => matchesWhere(row, where, relation))

  return {
    findFirst: async (args: FindArgs = {}) => filter(args.where)[0] ?? null,
    findMany: async (args: FindArgs = {}) => {
      const matched = filter(args.where)
      return typeof args.take === 'number' ? matched.slice(0, args.take) : matched
    },
    count: async (args: FindArgs = {}) => filter(args.where).length,
    updateMany: async (args: FindArgs = {}) => ({ count: filter(args.where).length }),
  }
}
