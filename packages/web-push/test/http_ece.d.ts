declare module 'http_ece' {
  type Parameters = {
    version: 'aes128gcm' | 'aesgcm';
    privateKey?: import('node:crypto').ECDH | undefined;
    dh?: string | undefined;
    authSecret?: string | undefined;
    salt?: string | undefined;
  };
  const ece: {
    encrypt(buffer: Buffer, parameters: Parameters): Buffer;
    decrypt(buffer: Buffer, parameters: Parameters): Buffer;
  };
  export default ece;
}
