declare module 'pbkdf2-password' {
  type Callback = (error: Error | null, password: string, salt: string, hash: string) => void;
  type Hasher = (
    options: { password?: string | undefined; salt?: string | undefined },
    callback: Callback,
  ) => void;
  export default function createHasher(options?: {
    saltLength?: number | undefined;
    iterations?: number | undefined;
    keyLength?: number | undefined;
    digest?: string | undefined;
  }): Hasher;
}
