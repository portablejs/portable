type Step = {
  descendant: boolean
  name: string | undefined
  index: number | undefined
}

export type States = {
  readonly ids: readonly number[]
  readonly matched: boolean
  readonly live: boolean
  readonly keyed: boolean
  any: States | null | undefined
  readonly byKey: Map<string, States | null>
}

export type Matcher = {
  readonly root: States
  next(states: States, key: string | number): States | null
}

const maxCachedKeys = 256

export function compile(paths: readonly string[]): Matcher {
  const steps = new Array<Step | null>()
  const starts = new Array<number>()
  for (const path of paths) {
    starts.push(steps.length)
    steps.push(...parsePath(path), null)
  }

  const interned = new Map<string, States>()
  const intern = (ids: number[]): States | null => {
    if (ids.length === 0) return null
    ids.sort((a, b) => a - b)
    const id = ids.join(',')
    let states = interned.get(id)
    if (states) return states
    const live = ids.filter((g) => steps[g] !== null)
    states = {
      ids,
      matched: live.length < ids.length,
      live: live.length > 0,
      keyed: live.some((g) => steps[g]!.name !== undefined || steps[g]!.index !== undefined),
      any: undefined,
      byKey: new Map(),
    }
    interned.set(id, states)
    return states
  }

  const advance = (states: States, key: string | number): States | null => {
    const ids = new Array<number>()
    const add = (g: number) => {
      if (!ids.includes(g)) ids.push(g)
    }
    for (const g of states.ids) {
      const step = steps[g]
      if (!step) continue
      if (step.descendant) add(g)
      if (
        step.name !== undefined ? step.name === key : step.index === undefined || step.index === key
      )
        add(g + 1)
    }
    return intern(ids)
  }

  return {
    root: intern([...new Set(starts)])!,
    next(states, key) {
      if (!states.keyed) {
        if (states.any === undefined) states.any = advance(states, key)
        return states.any
      }
      if (typeof key === 'number') return advance(states, key)
      let next = states.byKey.get(key)
      if (next === undefined) {
        next = advance(states, key)
        if (states.byKey.size < maxCachedKeys) states.byKey.set(key, next)
      }
      return next
    },
  }
}

function parsePath(path: string): Step[] {
  const fail = (at: number): never => {
    throw new RangeError(`Invalid JSONPath ${JSON.stringify(path)} at offset ${at}.`)
  }
  if (path[0] !== '$') fail(0)
  const steps = new Array<Step>()
  let i = 1
  while (i < path.length) {
    let descendant = false
    if (path.startsWith('..', i)) {
      descendant = true
      i += 2
    } else if (path[i] === '.') {
      i++
    } else if (path[i] !== '[') {
      fail(i)
    }

    if (path[i] === '[') {
      const start = i
      i++
      const quote = path[i]
      if (quote === '*') {
        if (path[i + 1] !== ']') fail(i + 1)
        steps.push({ descendant, name: undefined, index: undefined })
        i += 2
      } else if (quote === "'" || quote === '"') {
        let raw = ''
        for (i++; i < path.length && path[i] !== quote; i++) {
          if (path[i] === '\\') i++
          raw += path[i] ?? ''
        }
        if (path[i + 1] !== ']') fail(i + 1)
        steps.push({ descendant, name: raw, index: undefined })
        i += 2
      } else {
        const end = path.indexOf(']', i)
        const digits = path.slice(i, end)
        if (end < 0 || !/^(0|[1-9]\d*)$/.test(digits)) fail(start)
        steps.push({ descendant, name: undefined, index: Number(digits) })
        i = end + 1
      }
      continue
    }

    let end = i
    while (end < path.length && path[end] !== '.' && path[end] !== '[') end++
    const name = path.slice(i, end)
    if (name === '') fail(i)
    steps.push({ descendant, name: name === '*' ? undefined : name, index: undefined })
    i = end
  }
  return steps
}
