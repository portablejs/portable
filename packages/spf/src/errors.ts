export class Failure extends Error {
  override name = 'Spf.Failure'
  readonly result: 'temperror' | 'permerror'

  constructor(result: 'temperror' | 'permerror', reason: string) {
    super(reason)
    this.result = result
  }
}

export const permerror = (reason: string): Failure => new Failure('permerror', reason)
export const temperror = (reason: string): Failure => new Failure('temperror', reason)
