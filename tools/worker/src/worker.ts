// Runs test files inside a dedicated worker with Vitest's own runner, `expect` and `vi`. Vitest's
// browser tester sets up the same worker state on the page, so this file copies that setup without
// the RPC to the Vitest server, and posts the results back to the page instead.
import type { RunnerTask, RunnerTestFile, SerializedConfig, TestError } from 'vite-plus/test'

export type Request = {
  mode: 'collect' | 'run'
  files: readonly string[]
  config: SerializedConfig
}

export type Task = {
  id: string
  name: string
  type: RunnerTask['type']
  mode: RunnerTask['mode']
  state: NonNullable<RunnerTask['result']>['state'] | undefined
  errors: readonly TestError[]
  tasks: readonly Task[]
}

export type Response =
  | { type: 'start'; name: string; timeout: number }
  | {
      type: 'done'
      files: readonly Task[]
      unhandledErrors: readonly TestError[]
      scope: string
    }
  | { type: 'error'; message: string }

const unhandled = new Array<unknown>()
addEventListener('error', (event) => unhandled.push(event.error ?? event.message))
addEventListener('unhandledrejection', (event) => unhandled.push(event.reason))

addEventListener('message', ({ data }: MessageEvent<Request>) => {
  run(data).then(
    (response) => postMessage(response),
    (error: unknown) =>
      postMessage({
        type: 'error',
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      } satisfies Response),
  )
})

async function run(data: Request): Promise<Response> {
  const config = {
    ...data.config,
    // `-t` matches the page's test names, which start with the file path, so the worker runs them all.
    testNamePattern: undefined,
    snapshotOptions: {
      ...data.config.snapshotOptions,
      // A worker can't write files, so a snapshot mismatch fails instead of updating the file.
      updateSnapshot: 'none',
      snapshotEnvironment,
    },
  } satisfies SerializedConfig
  const rpc = new Proxy({}, { get: () => async () => {} })
  const state: Record<string, unknown> = {
    ctx: {
      rpc,
      pool: 'browser',
      workerId: 1,
      concurrencyId: 1,
      config,
      projectName: config.name,
      files: [],
      environment: { name: 'browser', options: null },
      providedContext: {},
      invalidates: [],
    },
    config,
    environment: { name: 'browser', viteEnvironment: 'client' },
    onCleanup: () => {},
    onCancel: () => {},
    resolvingModules: new Set(),
    moduleExecutionInfo: new Map(),
    metaEnv: { ...import.meta.env, ...config.env },
    rpc,
    durations: { environment: 0, prepare: 0, fetch: 0 },
    providedContext: {},
  }
  // `vite-plus/test` reads the state while it loads, so it's imported after the state is set.
  Object.assign(globalThis, { __vitest_worker__: state })
  const { EvaluatedModules, TestRunner } = await import('vite-plus/test')
  const { collectTests, processError, setupCommonEnv, startTests } =
    await import('vite-plus/test/internal/browser')
  state.evaluatedModules = new EvaluatedModules()
  await setupCommonEnv(config)

  // The page reports the last file or test that started if the worker stops responding.
  const start = (name: string, timeout: number) =>
    postMessage({ type: 'start', name, timeout } satisfies Response)
  class WorkerRunner extends TestRunner {
    override importFile = (filepath: string) => import(/* @vite-ignore */ filepath)
    override onCollectStart(file: RunnerTestFile) {
      start(file.name, config.hookTimeout)
      super.onCollectStart(file)
    }
    override onBeforeRunTask(test: RunnerTask) {
      start(test.fullName, 'timeout' in test ? test.timeout : config.testTimeout)
      return super.onBeforeRunTask(test)
    }
    override trace = <value>(
      _: string,
      attributes: object | (() => value),
      cb?: () => value,
    ): value => (cb ?? (attributes as () => value))()
  }
  const runner = new WorkerRunner(config)
  const files =
    data.mode === 'collect'
      ? await collectTests([...data.files], runner)
      : await startTests([...data.files], runner)
  return {
    type: 'done',
    files: files.map(toTask),
    unhandledErrors: unhandled.map((error) => processError(error)),
    scope: Object.prototype.toString.call(globalThis),
  }
}

const snapshotEnvironment = {
  getVersion: () => '1',
  getHeader: () => '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html',
  resolvePath: async (filepath: string) => `${filepath}.snap`,
  resolveRawPath: async (_testPath: string, rawPath: string) => rawPath,
  readSnapshotFile: async () => null,
  saveSnapshotFile: async () => {
    throw new Error('A worker can’t write snapshot files.')
  },
  removeSnapshotFile: async () => {},
}

function toTask(task: RunnerTask): Task {
  return {
    id: task.id,
    name: task.name,
    type: task.type,
    mode: task.mode,
    state: task.result?.state,
    errors: task.result?.errors ?? [],
    tasks: 'tasks' in task ? task.tasks.map(toTask) : [],
  }
}
