import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { ascii, buildTiff, concat, entry, exifPrefix, fixture, jpeg } from './utils.js'

const bytesOfLength = (length: number) =>
  expect.toSatisfy((v: unknown) => v instanceof Uint8Array && v.length === length)

describe('exif-parser', () => {
  test('reads every tag of starfish.jpg', async () => {
    const result = Exif.parse(await fixture('starfish.jpg'))
    expect(result.ifd0).toEqual({
      Make: 'Nokia',
      Model: 'Lumia 820',
      Orientation: 1,
      XResolution: 72,
      YResolution: 72,
      ResolutionUnit: 2,
      Software: 'Windows Phone',
      YCbCrPositioning: 1,
      Padding: bytesOfLength(2060),
    })
    expect(result.ifd1).toEqual({
      Compression: 6,
      XResolution: 72,
      YResolution: 72,
      ResolutionUnit: 2,
      ThumbnailOffset: 12210,
      ThumbnailLength: 18032,
    })
    expect(result.gps).toEqual({
      GPSVersionID: [2, 2, 0, 0],
      GPSLatitudeRef: 'N',
      GPSLatitude: [55, 2, 19.521],
      GPSLongitudeRef: 'E',
      GPSLongitude: [8, 27, 25.886],
      GPSAltitudeRef: 0,
      GPSAltitude: 10000 / 200000,
      GPSMeasureMode: '3',
      GPSDOP: 10000 / 80000,
      Padding: bytesOfLength(2060),
    })
    expect(result.exif).toEqual({
      ExposureTime: 3139 / 1000000,
      FNumber: 2.2,
      ISO: 100,
      ExifVersion: ascii('0220'),
      DateTimeOriginal: '2013:05:10 15:21:35',
      CreateDate: '2013:05:10 15:21:35',
      ComponentsConfiguration: new Uint8Array([1, 2, 3, 0]),
      ExposureCompensation: 0,
      Flash: 24,
      MakerNote: bytesOfLength(5243),
      FlashpixVersion: ascii('0100'),
      ColorSpace: 1,
      ExifImageWidth: 3552,
      ExifImageHeight: 2000,
      Padding: bytesOfLength(2060),
      OffsetSchema: 12,
    })
    expect(result.interop).toEqual({ InteropIndex: 'R98', InteropVersion: ascii('0100') })
  })

  test('reads the size from the SOF segment', async () => {
    expect(Exif.parse(await fixture('test.jpg')).imageSize).toEqual({ width: 2, height: 1 })
  })

  test('reads the Exif APP1 segment and skips the other APP segments', async () => {
    const result = Exif.parse(await fixture('test.jpg'))
    expect(result.ifd0.ResolutionUnit).toBe(2)
    expect(Object.keys(result.exif).length).toBeGreaterThan(0)
  })

  test('reads GPS coordinates as signed decimal degrees', async () => {
    const result = Exif.parse(await fixture('starfish.jpg'))
    expect(result.latitude).toBeCloseTo(55 + 2 / 60 + 19.521 / 3600, 12)
    expect(result.longitude).toBeCloseTo(8 + 27 / 60 + 25.886 / 3600, 12)
  })

  test('finds the thumbnail', async () => {
    const bytes = await fixture('starfish.jpg')
    const { thumbnail } = Exif.parse(bytes)
    expect(thumbnail?.offset).toBe(12240)
    expect(thumbnail?.length).toBe(18032)
    expect(thumbnail?.bytes).toEqual(bytes.subarray(12240, 12240 + 18032))
    expect(Exif.parse(thumbnail!.bytes!).imageSize).toBeDefined()
  })
})

describe('exif-reader', () => {
  test('reads TIFF and Exif tags', async () => {
    const result = Exif.parse(await fixture('tetons.exif'))
    expect(result.ifd0).toEqual({
      Make: 'Canon',
      Model: 'Canon EOS D60',
      Orientation: 1,
      XResolution: 300,
      YResolution: 300,
      ResolutionUnit: 2,
      Software: 'Adobe Photoshop CS Windows',
      ModifyDate: '2006:04:04 22:31:30',
      Artist: 'Unspecified',
      Copyright: 'Unspecified',
    })
    expect(result.ifd1).toEqual({
      Compression: 6,
      XResolution: 72,
      YResolution: 72,
      ResolutionUnit: 2,
      ThumbnailOffset: 1102,
      ThumbnailLength: 7050,
    })
    expect(result.exif).toEqual({
      ExposureTime: 0.03333333333333333,
      FNumber: 19,
      ExposureProgram: 2,
      ISO: 100,
      ExifVersion: new Uint8Array([48, 50, 50, 48]),
      DateTimeOriginal: '2004:06:17 06:47:02',
      CreateDate: '2004:06:17 06:47:02',
      ComponentsConfiguration: new Uint8Array([1, 2, 3, 0]),
      CompressedBitsPerPixel: 9,
      ShutterSpeedValue: 4.906890869140625,
      ApertureValue: 8.495849609375,
      ExposureCompensation: 0,
      MaxApertureValue: 4.33984375,
      MeteringMode: 6,
      Flash: 0,
      FocalLength: 70,
      UserComment: new Uint8Array(264),
      FlashpixVersion: new Uint8Array([48, 49, 48, 48]),
      ColorSpace: 1,
      ExifImageWidth: 1600,
      ExifImageHeight: 1195,
      FocalPlaneXResolution: 3443.946188340807,
      FocalPlaneYResolution: 3442.016806722689,
      FocalPlaneResolutionUnit: 2,
      SensingMethod: 2,
      FileSource: new Uint8Array([3]),
      CustomRendered: 0,
      ExposureMode: 0,
      WhiteBalance: 0,
      SceneCaptureType: 0,
    })
    expect(result.gps).toEqual({})
  })

  test('reads GPS and other Exif tags', async () => {
    const result = Exif.parse(await fixture('IMG_0774.exif'))
    expect(result.ifd0).toEqual({
      Make: 'Apple',
      Model: 'iPhone 6',
      Orientation: 1,
      XResolution: 72,
      YResolution: 72,
      ResolutionUnit: 2,
      Software: 'Photos 1.0',
      ModifyDate: '2015:02:28 17:13:57',
    })
    expect(result.exif).toMatchObject({
      ExposureTime: 0.0020491803278688526,
      FNumber: 2.2,
      ISO: 32,
      DateTimeOriginal: '2015:02:28 17:13:57',
      BrightnessValue: 7.991,
      SubjectArea: [964, 1287, 610, 612],
      MakerNote: bytesOfLength(244),
      SubSecTimeOriginal: '476',
      SceneType: new Uint8Array([1]),
      FocalLengthIn35mmFormat: 29,
      LensInfo: [4.15, 4.15, 2.2, 2.2],
      LensMake: 'Apple',
      LensModel: 'iPhone 6 back camera 4.15mm f/2.2',
    })
    expect(result.gps).toEqual({
      GPSLatitudeRef: 'N',
      GPSLatitude: [35, 18, 1.49],
      GPSLongitudeRef: 'W',
      GPSLongitude: [120, 39, 44.23],
      GPSAltitudeRef: 0,
      GPSAltitude: 97,
      GPSTimeStamp: [1, 13, 57],
      GPSSpeedRef: 'K',
      GPSSpeed: 0,
      GPSImgDirectionRef: 'T',
      GPSImgDirection: 347.4401408450704,
      GPSDestBearingRef: 'T',
      GPSDestBearing: 167.44014084507043,
      GPSDateStamp: '2015:03:01',
    })
    expect(result.longitude).toBeLessThan(0)
  })

  test('reads Exif data taken from a PNG', async () => {
    const result = Exif.parse(await fixture('png-exif.exif'))
    expect(result.ifd0).toMatchObject({
      Model: 'iPhone 11 Pro Max',
      HostComputer: 'iPhone 11 Pro Max',
    })
    expect(result.exif).toMatchObject({
      OffsetTime: '+01:00',
      OffsetTimeOriginal: '+01:00',
      CompositeImage: 2,
      ColorSpace: 65535,
      DigitalZoomRatio: 1.141132075471698,
      LensInfo: [1.5399999619997986, 6, 1.8, 2.4],
    })
    expect(result.gps).toMatchObject({ GPSHPositioningError: 4.884441575209813 })
  })

  test('decodes non-ASCII strings as UTF-8', async () => {
    expect(Exif.parse(await fixture('non-ascii.exif')).ifd0).toEqual({
      ImageDescription: '一三一四',
      XResolution: 1,
      YResolution: 1,
      ResolutionUnit: 1,
      YCbCrPositioning: 1,
    })
  })

  test('reads little-endian data', async () => {
    const result = Exif.parse(await fixture('little-endian.exif'))
    expect(result.ifd0).toEqual({
      Orientation: 1,
      XResolution: 25.4,
      YResolution: 25.4,
      ResolutionUnit: 2,
      Software: 'sharp',
      YCbCrPositioning: 1,
    })
    expect(result.exif).toEqual({
      ExifVersion: ascii('0210'),
      ComponentsConfiguration: new Uint8Array([1, 2, 3, 0]),
      FlashpixVersion: ascii('0100'),
      ColorSpace: 65535,
      ExifImageWidth: 1,
      ExifImageHeight: 1,
    })
  })

  test('throws UnsupportedError for data that is not EXIF', () => {
    expect(() => Exif.parse(new Uint8Array(50))).toThrow(Exif.UnsupportedError)
  })

  test('throws InvalidInputError without a byte order mark', () => {
    expect(() => Exif.parse(ascii('Exif\0\0IM\0*\0\0\0\x08'))).toThrow(Exif.InvalidInputError)
    expect(() => Exif.parse(ascii('Exif\0\0MI\0*\0\0\0\x08'))).toThrow(Exif.InvalidInputError)
  })
})

describe('exifr', () => {
  test('reads IFD0, Exif, interop and IFD1 tags', async () => {
    const result = Exif.parse(await fixture('img_1771.jpg'))
    expect(result.ifd0.Model).toBe('Canon PowerShot S40')
    expect(result.exif.ApertureValue).toBe(4.65625)
    expect(result.interop.InteropIndex).toBe('R98')
    expect(result.ifd1.Compression).toBe(6)
  })

  test('returns the thumbnail', async () => {
    const thumbnail = Exif.parse(await fixture('img_1771.jpg')).thumbnail!
    expect(thumbnail.length).toBe(5448)
    expect(thumbnail.bytes).toBeInstanceOf(Uint8Array)
    expect(thumbnail.bytes?.length).toBe(5448)
    expect(Array.from(thumbnail.bytes!.subarray(0, 7))).toEqual([
      0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84, 0x00,
    ])
  })

  test('returns empty IFDs and no thumbnail for JPEGs without EXIF', async () => {
    for (const name of ['img_1771_no_exif.jpg', 'noexif.jpg']) {
      const result = Exif.parse(await fixture(name))
      expect(result).toEqual({
        ifd0: {},
        ifd1: {},
        exif: {},
        gps: {},
        interop: {},
        imageSize: expect.any(Object),
      })
    }
  })

  test('reads Orientation', async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8])
      expect(Exif.parse(await fixture(`orientation-f${n}t.jpg`)).ifd0.Orientation).toBe(n)
  })

  test('skips 0xFF fill bytes before a JPEG marker', async () => {
    const result = Exif.parse(await fixture('issue-fast-exif-2.jpg'))
    expect(result.exif.ApertureValue).toBe(5.655638)
    expect(result.exif.LensModel).toBe('24.0-70.0 mm f/2.8')
  })

  test('returns stored values for tags with the wrong count', async () => {
    const result = Exif.parse(await fixture('issue-exifr-36.jpg'))
    expect(result.exif.ExifImageWidth).toEqual([100, 0])
    expect(result.exif.ExifImageHeight).toEqual([78, 0])
  })

  test('reads the other IFDs when the GPS IFD is broken', async () => {
    const result = Exif.parse(await fixture('broken1.jpg'))
    expect(result.ifd0.Model).toBe('Canon EOS 30D')
    expect(result.ifd0.Software).toBe('LIBFORMAT (c) Pierre-e Gougelet')
    expect(result.exif).toMatchObject({ ExposureTime: 0.004, Sharpness: 2, ExifImageWidth: 3504 })
    expect(result.gps.GPSVersionID).toEqual([2, 2, 0, 0])
    expect(result.latitude).toBeUndefined()
  })

  test('reads TIFF files', async () => {
    const dog = Exif.parse(await fixture('Bush-dog.tif'))
    expect(dog.imageSize).toEqual({ width: 40, height: 40 })
    const canon = Exif.parse(await fixture('tif-with-iptc-icc-xmp.tif'))
    expect(canon.ifd0.Make).toBe('Canon')
    expect(Object.keys(canon.exif).length).toBeGreaterThan(0)
  })

  test('reads the eXIf chunk of a PNG', async () => {
    const result = Exif.parse(await fixture('png_with_exif_and_gps.png'))
    expect(result.ifd0).toMatchObject({
      Make: 'Canon',
      Model: 'Canon PowerShot S40',
      Orientation: 1,
    })
    expect(result.gps).toMatchObject({ GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' })
    expect(result.latitude).toBe(50.29960277777778)
    expect(result.longitude).toBe(14.820294444444444)
  })

  test('reads the size of a PNG without EXIF', async () => {
    const result = Exif.parse(await fixture('IMG_20180725_163423-1.png'))
    expect(result.imageSize).toEqual({ width: 40, height: 30 })
    expect(result.ifd0).toEqual({})
  })

  test('reads the Exif item of an AVIF', async () => {
    const result = Exif.parse(await fixture('Irvine_CA.avif'))
    expect(result.ifd0).toMatchObject({ Make: 'Apple', Model: 'iPhone 3GS' })
    expect(result.exif.DateTimeOriginal).toBeTypeOf('string')
  })

  test('reads the Exif item of a HEIC from the start of the file', async () => {
    const result = Exif.parse(await fixture('heic-iphone7-head.heic'))
    expect(result.ifd0).toMatchObject({ Make: 'Apple', Model: 'iPhone 7' })
    expect(result.exif.OffsetTimeOriginal).toBe('+02:00')
    expect(result.gps.GPSLatitudeRef).toBe('N')
    expect(result.imageSize).toEqual({ width: 4032, height: 3024 })
  })

  test('returns empty IFDs for a HEIC without an Exif item', async () => {
    const result = Exif.parse(await fixture('heic-single-head.heic'))
    expect(result.ifd0).toEqual({})
    expect(result.imageSize).toEqual({ width: 1440, height: 960 })
  })

  test('throws UnsupportedError for other files', () => {
    expect(() => Exif.parse(ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/">'))).toThrow(
      Exif.UnsupportedError,
    )
  })
})

describe('parse', () => {
  const tiff = (le: boolean) =>
    buildTiff({
      le,
      ifd0: [
        entry(0x010f, 2, 'Make'),
        entry(0x0112, 3, [6]),
        entry(0x011a, 5, [300, 1]),
        entry(0x0100, 4, [640]),
        entry(0x0101, 4, [480]),
      ],
      exif: [
        entry(0x9204, 10, [-1, 3]),
        entry(0x9003, 2, '2020:01:02 03:04:05'),
        entry(0x9214, 3, [1, 2, 3, 4]),
        entry(0xc4a5, 7, new Uint8Array([9, 8, 7])),
        entry(0x9999, 8, [-2]),
        entry(0x9998, 9, [-70000, 5]),
        entry(0x9997, 6, [-1]),
        entry(0x9996, 11, [1.5]),
        entry(0x9995, 12, [-0.25]),
      ],
      gps: [
        entry(0x0001, 2, 'S'),
        entry(0x0002, 5, [10, 1, 30, 1, 0, 1]),
        entry(0x0003, 2, 'W'),
        entry(0x0004, 5, [20, 1, 0, 1, 36, 1]),
      ],
    })

  for (const le of [false, true]) {
    test(`reads ${le ? 'little' : 'big'}-endian TIFF values of every type`, () => {
      const result = Exif.parse(tiff(le))
      expect(result.ifd0).toEqual({
        Make: 'Make',
        Orientation: 6,
        XResolution: 300,
        ImageWidth: 640,
        ImageHeight: 480,
      })
      expect(result.exif).toEqual({
        ExposureCompensation: -1 / 3,
        DateTimeOriginal: '2020:01:02 03:04:05',
        SubjectArea: [1, 2, 3, 4],
        PrintIM: new Uint8Array([9, 8, 7]),
        '0x9999': -2,
        '0x9998': [-70000, 5],
        '0x9997': -1,
        '0x9996': 1.5,
        '0x9995': -0.25,
      })
      expect(result.latitude).toBe(-10.5)
      expect(result.longitude).toBe(-20.01)
      expect(result.imageSize).toEqual({ width: 640, height: 480 })
    })
  }

  test('reads the same tags from TIFF, Exif-prefixed, JPEG, PNG and WebP input', () => {
    const data = tiff(false)
    const expected = Exif.parse(data)
    const png = concat(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      [0, 0, 0, 13],
      ascii('IHDR'),
      [0, 0, 1, 0, 0, 0, 0, 2, 8, 2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, (data.length >> 8) & 255, data.length & 255],
      ascii('eXIf'),
      data,
      [0, 0, 0, 0],
    )
    const chunk = (type: string, body: Uint8Array | readonly number[]) =>
      concat(
        ascii(type),
        [body.length & 255, body.length >> 8, 0, 0],
        body,
        body.length & 1 ? [0] : [],
      )
    const vp8x = chunk('VP8X', [8, 0, 0, 0, 99, 0, 0, 49, 0, 0])
    const exifChunk = chunk('EXIF', data)
    const webpBody = concat(ascii('WEBP'), vp8x, exifChunk)
    const webp = concat(
      ascii('RIFF'),
      [webpBody.length & 255, webpBody.length >> 8, 0, 0],
      webpBody,
    )
    const strip = (result: Exif.Metadata) => ({ ...result, imageSize: undefined })
    for (const input of [concat(exifPrefix, data), jpeg(data), png, webp])
      expect(strip(Exif.parse(input))).toEqual(strip(expected))
    expect(Exif.parse(png).imageSize).toEqual({ width: 256, height: 2 })
    expect(Exif.parse(webp).imageSize).toEqual({ width: 100, height: 50 })
    expect(Exif.parse(jpeg(data)).imageSize).toEqual({ width: 3, height: 2 })
  })

  test('accepts the IFD pointer type 13 for sub-IFD offsets', () => {
    const data = buildTiff({
      ifd0: [entry(0x010f, 2, 'Make')],
      exif: [entry(0x9000, 7, ascii('0230'))],
    })
    new DataView(data.buffer).setUint16(8 + 2 + 12 + 2, 13)
    expect(Exif.parse(data).exif).toEqual({ ExifVersion: ascii('0230') })
  })

  test('keeps the first of two tags with the same id', () => {
    const data = buildTiff({ ifd0: [entry(0x010f, 2, 'One'), entry(0x010f, 2, 'Two')] })
    expect(Exif.parse(data).ifd0).toEqual({ Make: 'One' })
  })

  test('skips tags whose values lie outside the data', () => {
    const data = buildTiff({ ifd0: [entry(0x010f, 2, 'Long make'), entry(0x0112, 3, [1])] })
    new DataView(data.buffer).setUint32(8 + 2 + 8, 0xfffffff0)
    expect(Exif.parse(data).ifd0).toEqual({ Orientation: 1 })
  })

  test('skips tags of unknown types and IFDs past the end', () => {
    const data = buildTiff({
      ifd0: [entry(0x0112, 3, [1])],
      exif: [entry(0x9000, 7, ascii('0230'))],
    })
    const view = new DataView(data.buffer)
    view.setUint16(8 + 2 + 2, 99)
    view.setUint32(8 + 2 + 12 + 8, 0xffffff)
    expect(Exif.parse(data)).toMatchObject({ ifd0: {}, exif: {} })
  })

  test('keeps the tags whose values lie before the end of the input', () => {
    const data = jpeg(tiff(false))
    const result = Exif.parse(data.subarray(0, 100))
    expect(result.ifd0).toEqual({ Orientation: 6, ImageWidth: 640, ImageHeight: 480 })
    expect(result.imageSize).toBeUndefined()
  })

  test('returns empty IFDs when a JPEG ends before the TIFF header', () => {
    expect(Exif.parse(jpeg(tiff(false)).subarray(0, 14)).ifd0).toEqual({})
  })

  test('reports a thumbnail that lies past the end of the input without its bytes', async () => {
    const bytes = await fixture('img_1771.jpg')
    const { thumbnail } = Exif.parse(bytes.subarray(0, 4000))
    expect(thumbnail).toEqual({ offset: 2066, length: 5448, bytes: undefined })
  })

  test('throws TruncatedError for TIFF input shorter than its header', () => {
    expect(() => Exif.parse(ascii('MM\0*'))).toThrow(Exif.TruncatedError)
  })

  test('throws InvalidInputError for a bad magic number or IFD0 offset', () => {
    expect(() => Exif.parse(new Uint8Array([0x4d, 0x4d, 0, 43, 0, 0, 0, 8]))).toThrow(
      Exif.InvalidInputError,
    )
    expect(() => Exif.parse(new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 4]))).toThrow(
      Exif.InvalidInputError,
    )
  })
})

describe('known upstream issues', () => {
  test('exif-parser #36: a coordinate without its reference tag is positive', () => {
    const data = buildTiff({
      ifd0: [],
      gps: [entry(0x0002, 5, [10, 1, 30, 1, 0, 1]), entry(0x0004, 5, [20, 1, 0, 1, 0, 1])],
    })
    expect(Exif.parse(data)).toMatchObject({ latitude: 10.5, longitude: 20 })
  })

  test('exif-parser #11: strings are decoded as UTF-8', () => {
    const data = buildTiff({ ifd0: [entry(0x010e, 2, 'Fahrt über den Ozean')] })
    expect(Exif.parse(data).ifd0.ImageDescription).toBe('Fahrt über den Ozean')
  })

  test('exif-parser #29: an IFD whose entries run past the end does not throw', () => {
    const data = buildTiff({ ifd0: [entry(0x0112, 3, [3])] })
    new DataView(data.buffer).setUint16(8, 500)
    expect(Exif.parse(data).ifd0).toEqual({ Orientation: 3 })
  })

  test('exif-parser #30: the thumbnail Orientation does not replace the image Orientation', () => {
    const data = buildTiff({ ifd0: [entry(0x010f, 2, 'Make')], ifd1: [entry(0x0112, 3, [6])] })
    const result = Exif.parse(data)
    expect(result.ifd0.Orientation).toBeUndefined()
    expect(result.ifd1.Orientation).toBe(6)
  })

  test('exif-parser #17: a tag with format 0 is skipped instead of failing the parse', () => {
    const data = buildTiff({ ifd0: [entry(0x0112, 3, [3]), entry(0x0110, 2, 'Model')] })
    new DataView(data.buffer).setUint16(8 + 2 + 12 + 2, 0)
    expect(Exif.parse(data).ifd0).toEqual({ Orientation: 3 })
  })

  test('exif-parser #41: TIFF files are read', async () => {
    expect(Exif.parse(await fixture('Bush-dog.tif')).ifd0).not.toEqual({})
  })

  test('exif-parser: SSHORT and SLONG values are signed', () => {
    const data = buildTiff({ ifd0: [], exif: [entry(0x9999, 8, [-2]), entry(0x9998, 9, [-70000])] })
    expect(Exif.parse(data).exif).toEqual({ '0x9999': -2, '0x9998': -70000 })
  })

  test('exif-parser: Exif IFD tags are not reported as interop tags', async () => {
    const result = Exif.parse(await fixture('starfish.jpg'))
    expect(result.interop).toEqual({ InteropIndex: 'R98', InteropVersion: ascii('0100') })
    expect(result.exif.ISO).toBe(100)
  })

  test('exif-parser: an APP1 segment that is not Exif, such as XMP, is skipped', () => {
    const xmp = ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')
    const data = jpeg(buildTiff({ ifd0: [entry(0x0112, 3, [8])] }))
    const withXmp = concat(
      data.subarray(0, 2),
      [0xff, 0xe1, 0, xmp.length + 2],
      xmp,
      data.subarray(2),
    )
    expect(Exif.parse(withXmp).ifd0).toEqual({ Orientation: 8 })
  })
})
