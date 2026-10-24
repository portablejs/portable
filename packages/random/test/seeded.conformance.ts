import { describe, expect, test } from 'vite-plus/test';
import * as Random from '@portable/random';
import { splitmix64, xoshiro128ss } from '../src/seeded.js';

function words(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true));
}

describe('reference vectors', () => {
  // rand_xoshiro's `reference` test, produced with the authors' xoshiro128starstar.c (v1.1).
  test('xoshiro128** from the state [1, 2, 3, 4]', () => {
    const next = xoshiro128ss(1, 2, 3, 4);
    expect(Array.from({ length: 10 }, next)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  // rand_xoshiro's `reference` test, produced with the authors' splitmix64.c.
  test('SplitMix64 from the seed 1477776061723855037', () => {
    const next = splitmix64(1477776061723855037n);
    expect(Array.from({ length: 50 }, next)).toEqual([
      1985237415132408290n,
      2979275885539914483n,
      13511426838097143398n,
      8488337342461049707n,
      15141737807933549159n,
      17093170987380407015n,
      16389528042912955399n,
      13177319091862933652n,
      10841969400225389492n,
      17094824097954834098n,
      3336622647361835228n,
      9678412372263018368n,
      11111587619974030187n,
      7882215801036322410n,
      5709234165213761869n,
      7799681907651786826n,
      4616320717312661886n,
      4251077652075509767n,
      7836757050122171900n,
      5054003328188417616n,
      12919285918354108358n,
      16477564761813870717n,
      5124667218451240549n,
      18099554314556827626n,
      7603784838804469118n,
      6358551455431362471n,
      3037176434532249502n,
      3217550417701719149n,
      9958699920490216947n,
      5965803675992506258n,
      12000828378049868312n,
      12720568162811471118n,
      245696019213873792n,
      8351371993958923852n,
      14378754021282935786n,
      5655432093647472106n,
      5508031680350692005n,
      8515198786865082103n,
      6287793597487164412n,
      14963046237722101617n,
      3630795823534910476n,
      8422285279403485710n,
      10554287778700714153n,
      10871906555720704584n,
      8659066966120258468n,
      9420238805069527062n,
      10338115333623340156n,
      13514802760105037173n,
      14635952304031724449n,
      15419692541594102413n,
    ]);
  });

  // `Xoshiro128StarStar::seed_from_u64(seed)` and eight `next_u32()` calls, run with rand_xoshiro
  // 0.8.1 from github.com/rust-random/rngs. A negative seed is its 64-bit two's complement.
  const rust = [
    [
      0,
      [
        3737715805, 2584255861, 2876756834, 3286328325, 1553311962, 1625202774, 3260698944,
        2754151956,
      ],
    ],
    [
      1,
      [
        1695105466, 1423115009, 634581793, 1068227753, 716759206, 4186505319, 3777694425,
        2710820970,
      ],
    ],
    [
      42,
      [
        1776835114, 4165204688, 17111135, 2317295270, 2792088233, 2554630222, 2940343271,
        2244566231,
      ],
    ],
    [
      2 ** 32,
      [
        3857403066, 3761880522, 2833589495, 1190737128, 4014693229, 145220835, 2612592572,
        3781970663,
      ],
    ],
    [
      Number.MAX_SAFE_INTEGER,
      [
        1233166643, 1287031142, 661813442, 2960669951, 2601079046, 1036114921, 2300589652,
        2591400186,
      ],
    ],
    [
      -1,
      [477689756, 2493998634, 555695776, 607808419, 61340979, 301466976, 2478485284, 2565876330],
    ],
  ] satisfies readonly [number, readonly number[]][];
  for (const [seed, expected] of rust) {
    test(`seeded(${seed}) matches rand_xoshiro's seed_from_u64`, () => {
      expect(words(Random.seeded(seed).bytes(32))).toEqual(expected);
    });
  }
});
