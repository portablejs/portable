// @types/jsonstream declares the lowercase module name, which doesn't resolve to the JSONStream
// package.
declare module 'JSONStream' {
  const JSONStream: {
    parse(path?: string | readonly unknown[]): NodeJS.ReadWriteStream;
  };
  export default JSONStream;
}
