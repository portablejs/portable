import { describe, expect, test } from 'vite-plus/test';
import { raw } from './utils.js';

const api = {
  subtract(a: number | { minuend: number; subtrahend: number }, b?: number) {
    return typeof a === 'number' ? a - b! : a.minuend - a.subtrahend;
  },
  sum: (...values: number[]) => values.reduce((a, b) => a + b, 0),
  update() {},
  notify_hello() {},
  get_data: () => ['hello', 5],
};

const invalidRequest = {
  jsonrpc: '2.0',
  error: { code: -32600, message: 'Invalid Request' },
  id: null,
};
const parseError = { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null };

describe('JSON-RPC 2.0 specification examples', () => {
  test('rpc call with positional parameters', async () => {
    const server = raw(api);
    expect(
      await server.send('{"jsonrpc": "2.0", "method": "subtract", "params": [42, 23], "id": 1}'),
    ).toEqual([{ jsonrpc: '2.0', result: 19, id: 1 }]);
    expect(
      await server.send('{"jsonrpc": "2.0", "method": "subtract", "params": [23, 42], "id": 2}'),
    ).toEqual([{ jsonrpc: '2.0', result: -19, id: 2 }]);
  });

  test('rpc call with named parameters', async () => {
    const server = raw(api);
    expect(
      await server.send(
        '{"jsonrpc": "2.0", "method": "subtract", "params": {"subtrahend": 23, "minuend": 42}, "id": 3}',
      ),
    ).toEqual([{ jsonrpc: '2.0', result: 19, id: 3 }]);
    expect(
      await server.send(
        '{"jsonrpc": "2.0", "method": "subtract", "params": {"minuend": 42, "subtrahend": 23}, "id": 4}',
      ),
    ).toEqual([{ jsonrpc: '2.0', result: 19, id: 4 }]);
  });

  test('a notification', async () => {
    const server = raw(api);
    expect(
      await server.send('{"jsonrpc": "2.0", "method": "update", "params": [1,2,3,4,5]}'),
    ).toEqual([]);
    expect(await server.send('{"jsonrpc": "2.0", "method": "foobar"}')).toEqual([]);
  });

  test('rpc call of non-existent method', async () => {
    const server = raw(api);
    expect(await server.send('{"jsonrpc": "2.0", "method": "foobar", "id": "1"}')).toEqual([
      { jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: '1' },
    ]);
  });

  test('rpc call with invalid JSON', async () => {
    const server = raw(api);
    expect(
      await server.send('{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]'),
    ).toEqual([parseError]);
  });

  test('rpc call with invalid Request object', async () => {
    const server = raw(api);
    expect(await server.send('{"jsonrpc": "2.0", "method": 1, "params": "bar"}')).toEqual([
      invalidRequest,
    ]);
  });

  test('rpc call Batch, invalid JSON', async () => {
    const server = raw(api);
    expect(
      await server.send(`[
        {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
        {"jsonrpc": "2.0", "method"
      ]`),
    ).toEqual([parseError]);
  });

  test('rpc call with an empty Array', async () => {
    const server = raw(api);
    expect(await server.send('[]')).toEqual([invalidRequest]);
  });

  test('rpc call with an invalid Batch (but not empty)', async () => {
    const server = raw(api);
    expect(await server.send('[1]')).toEqual([[invalidRequest]]);
  });

  test('rpc call with invalid Batch', async () => {
    const server = raw(api);
    expect(await server.send('[1,2,3]')).toEqual([
      [invalidRequest, invalidRequest, invalidRequest],
    ]);
  });

  test('rpc call Batch', async () => {
    const server = raw(api);
    const [responses] = await server.send(`[
      {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
      {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]},
      {"jsonrpc": "2.0", "method": "subtract", "params": [42,23], "id": "2"},
      {"foo": "boo"},
      {"jsonrpc": "2.0", "method": "foo.get", "params": {"name": "myself"}, "id": "5"},
      {"jsonrpc": "2.0", "method": "get_data", "id": "9"}
    ]`);
    expect(responses).toEqual([
      { jsonrpc: '2.0', result: 7, id: '1' },
      { jsonrpc: '2.0', result: 19, id: '2' },
      invalidRequest,
      { jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: '5' },
      { jsonrpc: '2.0', result: ['hello', 5], id: '9' },
    ]);
  });

  test('rpc call Batch (all notifications)', async () => {
    const server = raw(api);
    expect(
      await server.send(`[
        {"jsonrpc": "2.0", "method": "notify_sum", "params": [1,2,4]},
        {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]}
      ]`),
    ).toEqual([]);
  });
});
