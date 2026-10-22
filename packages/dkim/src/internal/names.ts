import { hostToAscii } from '@portable/idna/internal'

const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const domainName = new RegExp(`^${label}(?:\\.${label})+$`)
const selectorName = new RegExp(`^${label}(?:\\.${label})*$`)
const localPart =
  /^(?:(?:[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]|[\u0080-\uffff])+(?:\.(?:[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]|[\u0080-\uffff])+)*|"(?:[^"\\\r\n]|\\.)*")$/

/**
 * A domain or selector in lower-case A-label form (RFC 5890), or `undefined` when it isn't a
 * host name. U-labels are converted with the URL parser, which runs IDNA in every runtime.
 */
export function toALabel(name: string): string | undefined {
  if (/^[A-Za-z0-9.-]*$/.test(name)) return name.toLowerCase()
  if (/[^A-Za-z0-9.\-\u0080-\uffff]/.test(name)) return undefined
  return hostToAscii(name)
}

export const isDomainName = (name: string): boolean => domainName.test(name) && name.length <= 253

export const isSelector = (name: string): boolean => selectorName.test(name)

export const isLocalPart = (text: string): boolean => text === '' || localPart.test(text)

/** Whether `child` is `parent` or one of its subdomains, both in A-label form. */
export const isSameOrSubdomain = (child: string, parent: string): boolean =>
  child === parent || child.endsWith(`.${parent}`)

/** Whether a name fits in DNS (RFC 1035 section 2.3.4). */
export const fitsDns = (name: string): boolean =>
  name.length <= 253 && name.split('.').every((part) => part.length > 0 && part.length <= 63)
