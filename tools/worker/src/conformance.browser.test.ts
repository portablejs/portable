// Runs every `*.conformance.ts` file again inside a dedicated module worker, because the browser
// project runs test files on the page's main thread. One worker collects the test names of every
// file, so this file can declare one page test per worker test. Each file then runs in a fresh
// worker of its own, and each page test reports the result of its worker test.
import { afterAll, beforeAll, describe, expect, test, type TestError } from 'vite-plus/test'
import { server } from 'vite-plus/test/browser'
import type { Request, Response, Task } from './worker.js'

// Vitest serves test files at their file system path, so the URL's path is the file's path.
const files = Object.keys(import.meta.glob('../../../packages/*/test/*.conformance.ts')).map(
  (path) => new URL(path, import.meta.url).pathname,
)

// WebKit garbage-collects a running worker that only its own listeners reference, which stops it.
const running = new Set<Worker>()

class StallError extends Error {}

const collected = await run('collect', files)

test('collects the files in a dedicated worker', () => {
  expect(collected.scope).toBe('[object DedicatedWorkerGlobalScope]')
  if (collected.unhandledErrors.length > 0) throw toError(collected.unhandledErrors)
})

for (const [index, file] of collected.files.entries()) {
  describe(file.name, () => {
    const results = new Map<string, Task>()
    const errors = [...file.errors] satisfies TestError[]
    beforeAll(async () => {
      const {
        files: [ran],
        unhandledErrors,
      } = await run('run', [files[index]!])
      errors.push(...(ran?.errors ?? []), ...unhandledErrors)
      for (const task of flatten(ran?.tasks ?? [])) results.set(task.id, task)
    }, 600_000)
    // An error outside a test, such as a failed hook, fails the file's suite.
    afterAll(() => {
      if (errors.length > 0) throw toError(errors)
    })
    if (file.errors.length > 0) {
      test('collects in the worker', () => {
        throw toError(file.errors)
      })
    }
    declare(file.tasks, results)
  })
}

function declare(tasks: readonly Task[], results: ReadonlyMap<string, Task>) {
  for (const task of tasks) {
    if (task.type === 'suite') {
      describe(task.name, () => {
        declare(task.tasks, results)
      })
      continue
    }
    const options = { skip: task.mode === 'skip', todo: task.mode === 'todo' }
    test(task.name, options, ({ skip }) => {
      const result = results.get(task.id)
      if (result?.state === 'fail') throw toError(result.errors)
      if (result?.state !== 'pass') skip(`skipped in the worker (${result?.state ?? 'not run'})`)
    })
  }
}

function flatten(tasks: readonly Task[]): Task[] {
  return tasks.flatMap((task) => [task, ...flatten(task.tasks)])
}

type Done = Extract<Response, { type: 'done' }>

// WebKit's `ReadableStreamDefaultReader.releaseLock()` holds the reader's lock while it calls into
// JavaScript. If that call starts a garbage collection, the collector waits for the same lock and the
// thread never runs again. Workers collect often enough that this hung about one WebKit run in three,
// so in WebKit a file whose worker stops responding runs once more in a new worker. See
// docs/papercuts.md.
async function run(mode: Request['mode'], files: readonly string[]): Promise<Done> {
  try {
    return await attempt(mode, files)
  } catch (error) {
    if (!(error instanceof StallError) || server.browser !== 'webkit') throw error
    // oxlint-disable-next-line no-console
    console.warn(`${error.message}. Running it again in a new worker.`)
    return attempt(mode, files)
  }
}

function attempt(mode: Request['mode'], files: readonly string[]): Promise<Done> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  running.add(worker)
  const request = { mode, files, config: server.config } satisfies Request
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<Done>((resolve, reject) => {
    // A test or hook in the worker fails when its timeout passes, so a worker that sends nothing
    // for much longer is stuck in a synchronous loop or deadlocked.
    const wait = (started: string, timeout: number) => {
      const idle = Math.max(2 * timeout, 60_000)
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          reject(
            new StallError(`The worker sent nothing for ${idle} ms after starting ${started}`),
          ),
        idle,
      )
    }
    worker.addEventListener('message', ({ data }: MessageEvent<Response>) => {
      if (data.type === 'done') resolve(data)
      else if (data.type === 'error') reject(new Error(`The worker failed: ${data.message}`))
      else wait(data.name, data.timeout)
    })
    worker.addEventListener('error', (event) =>
      reject(new Error(`Worker failed: ${event.message}`)),
    )
    wait('the worker', server.config.hookTimeout)
    worker.postMessage(request)
  }).finally(() => {
    clearTimeout(timer)
    worker.terminate()
    running.delete(worker)
  })
}

function toError(errors: readonly TestError[]): Error {
  const message = errors
    .map((error, i) => [i > 0 ? `${error.name}: ${error.message}` : error.message, error.diff])
    .flatMap((lines) => lines.filter(Boolean))
    .join('\n\n')
  const error = new Error(message)
  error.name = errors[0]?.name ?? 'Error'
  if (errors[0]?.stack) error.stack = errors[0].stack
  return error
}
