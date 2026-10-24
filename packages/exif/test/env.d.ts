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
