declare module 'exif-parser' {
  type RawTag = { section: number; type: number; value: unknown };
  type Result = {
    tags: Record<string, unknown> & RawTag[];
    imageSize: { width: number; height: number } | undefined;
    hasThumbnail(mime?: string): boolean;
    getThumbnailOffset(): number;
    getThumbnailLength(): number;
    getThumbnailBuffer(): Uint8Array;
  };
  type Parser = {
    enableBinaryFields(enable: boolean): Parser;
    enablePointers(enable: boolean): Parser;
    enableTagNames(enable: boolean): Parser;
    enableSimpleValues(enable: boolean): Parser;
    parse(): Result;
  };
  const ExifParser: { create(buffer: Uint8Array): Parser };
  export default ExifParser;
}

declare module 'libheif-js/wasm-bundle' {
  type Image = {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
  };
  const libheif: { HeifDecoder: new () => { decode(bytes: Uint8Array): Image[] } };
  export default libheif;
}
