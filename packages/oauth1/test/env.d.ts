declare module '*?raw' {
  const text: string;
  export default text;
}

declare module 'oauth' {
  export class OAuth {
    constructor(
      requestUrl: string | null,
      accessUrl: string | null,
      consumerKey: string,
      consumerSecret: string,
      version: string,
      authorizeCallback: string | null,
      signatureMethod: string,
    );
    authHeader(url: string, token?: string, tokenSecret?: string, method?: string): string;
    _getTimestamp: () => number;
    _getNonce: () => string;
  }
}
