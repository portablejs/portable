import * as Ip from '@portable/ip'

export function parseIp(text: string): Ip.Address | undefined {
  if (!Ip.canParse(text)) return undefined
  const address = Ip.parse(text)
  return address.version === 6 && address.zone !== undefined ? undefined : address
}

export function isInNetwork(address: Ip.Address, network: Ip.Address, prefix: number): boolean {
  return address.version === network.version && Ip.contains({ address: network, prefix }, address)
}

export function dotted(address: Ip.Address): string {
  if (address.version === 4) return address.bytes.join('.')
  return Array.from(address.bytes, (b) => `${(b >> 4).toString(16)}.${(b & 15).toString(16)}`).join(
    '.',
  )
}
