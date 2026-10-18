interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: 'default' },
  ): Record<string, () => Promise<T>>
}
