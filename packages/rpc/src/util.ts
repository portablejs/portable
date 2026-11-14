export const noop = (): void => {};

export type Deferred<value> = {
  promise: Promise<value>;
  resolve: (value: value) => void;
  reject: (reason: unknown) => void;
};

export function deferred<value>(): Deferred<value> {
  let resolve!: (value: value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<value>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
