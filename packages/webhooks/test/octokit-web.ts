// @octokit/webhooks-methods exports its WebCrypto build only under the `browser` condition, and
// Node tests resolve `node`.
const url = new URL('./node_modules/@octokit/webhooks-methods/dist-web/index.js', import.meta.url)
  .href

export const octokitWeb: typeof import('@octokit/webhooks-methods') = await import(
  /* @vite-ignore */ url
)
