import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '../index.js'

const seconds = (date: Date | undefined) => date && date.getTime() / 1000

describe('exif-parser', () => {
  test('parses the unix epoch without a time zone', () => {
    expect(seconds(Exif.parseDate('1970:01:01 00:00:00'))).toBe(0)
  })

  test('parses a date without a time zone as UTC', () => {
    expect(Exif.parseDate('1990:02:14 14:30:14')).toEqual(new Date('1990-02-14T14:30:14Z'))
  })

  test('returns undefined for an invalid date without a time zone', () => {
    expect(Exif.parseDate('1990:AA:14 14:30:14')).toBeUndefined()
  })

  test('parses an ISO 8601 date with a time zone', () => {
    expect(Exif.parseDate('2004-09-04T23:39:06-08:00')).toEqual(new Date('2004-09-05T07:39:06Z'))
  })

  test('returns undefined for an invalid time zone', () => {
    expect(Exif.parseDate('2004-09-04T23:39:06A08:00')).toBeUndefined()
  })

  test('parses both date formats', () => {
    expect(seconds(Exif.parseDate('1970:01:01 00:00:00'))).toBe(0)
    expect(seconds(Exif.parseDate('1970-01-01T00:00:00-01:00'))).toBe(3600)
  })

  test('parses DateTimeOriginal, CreateDate and ModifyDate values', () => {
    expect(seconds(Exif.parseDate('1970:01:01 00:00:00'))).toBe(0)
    expect(seconds(Exif.parseDate('1970-01-01T00:00:00-05:00'))).toBe(5 * 3600)
  })
})

describe('parseDate', () => {
  test('applies the offset option', () => {
    expect(Exif.parseDate('2019:10:20 18:34:30', { offset: '+02:00' })).toEqual(
      new Date('2019-10-20T16:34:30Z'),
    )
    expect(Exif.parseDate('2019:10:20 18:34:30', { offset: '-0530' })).toEqual(
      new Date('2019-10-21T00:04:30Z'),
    )
  })

  test('prefers a time zone in the value over the offset option', () => {
    expect(Exif.parseDate('2004-09-04T23:39:06Z', { offset: '+02:00' })).toEqual(
      new Date('2004-09-04T23:39:06Z'),
    )
  })

  test('ignores an offset option that is not an offset', () => {
    expect(Exif.parseDate('2019:10:20 18:34:30', { offset: 'undefined' })).toEqual(
      new Date('2019-10-20T18:34:30Z'),
    )
  })

  test('keeps fractional seconds', () => {
    expect(Exif.parseDate('2019:10:20 18:34:30.130')?.getUTCMilliseconds()).toBe(130)
  })

  test('returns undefined for unset and impossible dates', () => {
    expect(Exif.parseDate('0000:00:00 00:00:00')).toBeUndefined()
    expect(Exif.parseDate('    :  :     :  :  ')).toBeUndefined()
    expect(Exif.parseDate('2019:02:30 10:00:00')).toBeUndefined()
    expect(Exif.parseDate('2019:10:20 24:00:00')).toBeUndefined()
  })
})
