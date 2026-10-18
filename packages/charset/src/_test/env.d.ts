declare module '*?raw' {
  const text: string
  export default text
}

interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>
}
