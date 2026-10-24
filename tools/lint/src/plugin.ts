import type { RuleTester } from 'oxlint/plugins-dev'

// oxlint loads this file with Node, which can't resolve a relative `.js` import to a `.ts` file,
// so the rules live here instead of in their own modules.

type Rule = Parameters<RuleTester['run']>[1]

/**
 * Reports `const name: Type = value`. The annotation widens the constant to `Type`, while
 * `const name = value satisfies Type` checks the value against `Type` and keeps the narrower type
 * that TypeScript infers. It allows an annotation when the wider type is the point: `unique
 * symbol`, a type with an index signature such as `Record<string, number>`, whose keys a lookup
 * reads with any string, an object that the code later writes properties to or that refers to
 * itself, and an exported constant, whose annotation is its public type. It also allows one on an
 * empty collection, such as `const chunks: Uint8Array[] = []`, because `[] satisfies Uint8Array[]`
 * infers `never[]` and the first `push` fails to type-check.
 */
type Node = { type: string; parent?: Node | null; [key: string]: unknown }

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value

// `unknown`, `unique symbol`, `Record<…>` alone or in `Partial` or `Readonly`, a mapped type, or a
// type literal with an index signature.
function isWide(type: unknown): boolean {
  if (!isNode(type)) return false
  if (type.type === 'TSUnknownKeyword') return true
  if (type.type === 'TSTypeOperator') return type['operator'] === 'unique'
  if (type.type === 'TSMappedType') return true
  if (type.type === 'TSTypeLiteral')
    return (type['members'] as Node[]).some((member) => member.type === 'TSIndexSignature')
  if (type.type !== 'TSTypeReference') return false
  const name = type['typeName'] as Node
  if (name.type !== 'Identifier') return false
  if (name['name'] === 'Record') return true
  const [argument] = ((type['typeArguments'] as Node | null)?.['params'] ?? []) as Node[]
  return ['Partial', 'Readonly'].includes(name['name'] as string) && !!argument && isWide(argument)
}

// `[]`, `new Map()` or `new Set()`, or an array or object literal holding only those.
function isEmpty(node: unknown): boolean {
  if (!isNode(node)) return false
  if (node.type === 'ArrayExpression') return (node['elements'] as unknown[]).every(isEmpty)
  if (node.type === 'ObjectExpression')
    return (node['properties'] as Node[]).every(
      (property) => property.type === 'Property' && isEmpty(property['value']),
    )
  if (node.type !== 'NewExpression') return false
  const callee = node['callee'] as Node
  return (
    callee.type === 'Identifier' &&
    ['Map', 'Set'].includes(callee['name'] as string) &&
    (node['arguments'] as unknown[]).length === 0 &&
    node['typeArguments'] == null
  )
}

// `name.key = …`, `name[key] = …`, `name.key++` or `delete name.key`.
function writesMember(identifier: unknown): boolean {
  if (!isNode(identifier)) return false
  const member = identifier.parent
  if (member?.type !== 'MemberExpression' || member['object'] !== identifier) return false
  const parent = member.parent
  if (parent?.type === 'AssignmentExpression') return parent['left'] === member
  if (parent?.type === 'UpdateExpression') return true
  return parent?.type === 'UnaryExpression' && parent['operator'] === 'delete'
}

const preferSatisfies = {
  meta: {
    type: 'suggestion',
    messages: {
      preferSatisfies:
        'Write `const name = value satisfies Type`. If the inferred type is too narrow or circular, use a function with a return type, or a `let`.',
    },
  },
  create: (context) => ({
    VariableDeclarator: (node) => {
      if (node.parent.type !== 'VariableDeclaration' || node.parent.kind !== 'const') return
      if (node.parent.parent?.type === 'ExportNamedDeclaration') return
      if (node.init === null) return
      if (!('typeAnnotation' in node.id) || node.id.typeAnnotation == null) return
      if (isWide(node.id.typeAnnotation.typeAnnotation)) return
      if (isEmpty(node.init)) return
      // `const view: Type = value` reads an existing value through a wider type.
      if (node.init.type === 'Identifier' || node.init.type === 'MemberExpression') return
      const [variable] = context.sourceCode.getDeclaredVariables(node)
      if (variable?.references.some((reference) => writesMember(reference.identifier))) return
      // An initializer that refers to the constant itself needs the annotation to infer a type.
      const [start, end] = node.init.range
      if (
        variable?.references.some(
          ({ identifier: { range } }) => range[0] >= start && range[1] <= end,
        )
      )
        return
      context.report({ node: node.id, messageId: 'preferSatisfies' })
    },
  }),
} satisfies Rule

const isReported = (name: string) => name.length === 1 || /^[A-Z]/.test(name)

/**
 * Reports a type parameter or a mapped-type key with a capitalized or one-letter name. A lowercase
 * word, such as `chunk`, tells the reader what the parameter holds.
 */
const typeParameterName = {
  meta: {
    type: 'suggestion',
    messages: {
      typeParameterName:
        'Name a type parameter with a lowercase word that says what it holds, such as `chunk`.',
    },
  },
  create: (context) => ({
    TSTypeParameter: (node) => {
      if (isReported(node.name.name))
        context.report({ node: node.name, messageId: 'typeParameterName' })
    },
    TSMappedType: (node) => {
      if (isReported(node.key.name))
        context.report({ node: node.key, messageId: 'typeParameterName' })
    },
  }),
} satisfies Rule

/**
 * The oxlint rules that only this repo has, under the `portable` prefix. `vite.config.ts` loads
 * the plugin, so `vp check` runs the rules on every package.
 */
const plugin = {
  meta: { name: 'portable' },
  rules: { 'prefer-satisfies': preferSatisfies, 'type-parameter-name': typeParameterName },
}

export default plugin
