declare module 'pbkdf2-password' {
  type Callback = (error: Error | null, password: string, salt: string, hash: string) => void
  type Hasher = (options: { password?: string; salt?: string }, callback: Callback) => void
  export default function createHasher(options?: {
    saltLength?: number
    iterations?: number
    keyLength?: number
    digest?: string
  }): Hasher
}
