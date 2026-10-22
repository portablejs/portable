import * as Errors from '@portable/errors'
export class Failure extends Errors.BaseError {
  static override readonly kind: string = 'Spf.Failure'
  readonly result: 'temperror' | 'permerror'

  constructor(options: { result: 'temperror' | 'permerror'; message: string }) {
    super(options.message)
    this.result = options.result
  }
}

export const permerror = (reason: string): Failure =>
  new Failure({ result: 'permerror', message: reason })
export const temperror = (reason: string): Failure =>
  new Failure({ result: 'temperror', message: reason })
