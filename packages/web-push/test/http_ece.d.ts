declare module 'http_ece' {
  type Parameters = {
    version: 'aes128gcm' | 'aesgcm'
    privateKey?: import('node:crypto').ECDH
    dh?: string
    authSecret?: string
    salt?: string
  }
  const ece: {
    encrypt(buffer: Buffer, parameters: Parameters): Buffer
    decrypt(buffer: Buffer, parameters: Parameters): Buffer
  }
  export default ece
}
