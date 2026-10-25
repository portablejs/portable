import { describe, expect, test } from 'vite-plus/test';
import * as OAuth1 from '@portable/oauth1';
import { baseString, form, hmac, parseHeader, signature, twitter } from './utils.js';

const tweet = () =>
  new Request(
    'https://api.twitter.com/1/statuses/update.json?include_entities=true',
    form('status=Hello+Ladies+%2B+Gentlemen%2C+a+signed+OAuth+request%21'),
  );

describe('cases from the oauth-1.0a test suite', () => {
  test('Twitter documentation example: base string, signing key, signature, and header', async () => {
    expect(await OAuth1.authorization(tweet(), twitter)).toBe(
      'OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature="tnnArxj06cWHq44gCs1OSKk%2FjLY%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1318622958", oauth_token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", oauth_version="1.0"',
    );
  });

  test('a URLSearchParams body is signed like the same form string', async () => {
    const request = new Request(
      'https://api.twitter.com/1/statuses/update.json?include_entities=true',
      {
        method: 'POST',
        body: new URLSearchParams({ status: 'Hello Ladies + Gentlemen, a signed OAuth request!' }),
      },
    );
    expect(await signature(request, twitter)).toBe('tnnArxj06cWHq44gCs1OSKk/jLY=');
  });

  test('the signing key ends in "&" when there is no token secret', async () => {
    const options = {
      signatureMethod: 'PLAINTEXT',
      consumer: { key: 'k', secret: twitter.consumer.secret },
    } as const;
    expect(await signature(new Request('https://example.com/'), options)).toBe(
      'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw&',
    );
    expect(
      await signature(new Request('https://example.com/'), { ...options, token: twitter.token }),
    ).toBe('kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw&LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE');
  });

  test('duplicate query parameters are all signed', async () => {
    const request = new Request(
      'http://localhost:3737/rest/profiles?property=email&value=vel.arcu%40ultriciesornareelit.ca&property=visitdate&value=abc&alt=json',
    );
    const actual = await signature(request, {
      consumer: {
        key: 'batch-8f4fd2c6-9fa3-4368-9797-52876d723dd1',
        secret: 'ZACXtYe6LQ4C5X0KbJcDkbW77GYtlaoU',
      },
      nonce: 'xsEYfvjTEiPTR3TqJbmhCpUdrDoHF6nk',
      now: new Date(1504882975_000),
    });
    expect(actual).toBe('b6nMehqpHnpx0VlZB9IhqFh4Jq0=');
  });

  test('a form value repeated in the body and the query is signed every time', async () => {
    const request = new Request(
      'http://localhost:3737/rest/profiles/1ea2a42f-e14d-4057-8bcd-3e0b4514a267/properties?alt=json',
      form(
        'currentbrowserversion=1&currentbrowserversion=5&currentbrowserversion=dfadfadfa&alt=json',
        {
          method: 'PUT',
        },
      ),
    );
    const options = {
      consumer: {
        key: 'batch-dbc2cd8c-6ca8-463b-96e2-6d8683eac6fd',
        secret: '4S4Rvm25CJZWv7HBg5HOhhlRTBSZ7npl',
      },
      nonce: 'tKOQtKan8PHIrIoOlrl17zHkZQ2H5CsP',
      now: new Date(1445951836_000),
    };
    const params = parseHeader(await OAuth1.authorization(request, options));
    expect(params.oauth_nonce).toBe('tKOQtKan8PHIrIoOlrl17zHkZQ2H5CsP');
    expect(params.oauth_timestamp).toBe('1445951836');
    const base = baseString(
      'PUT',
      'http://localhost:3737/rest/profiles/1ea2a42f-e14d-4057-8bcd-3e0b4514a267/properties',
      'alt=json&alt=json&currentbrowserversion=1&currentbrowserversion=5&currentbrowserversion=dfadfadfa&oauth_consumer_key=batch-dbc2cd8c-6ca8-463b-96e2-6d8683eac6fd&oauth_nonce=tKOQtKan8PHIrIoOlrl17zHkZQ2H5CsP&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1445951836&oauth_version=1.0',
    );
    expect(params.oauth_signature).toBe(
      await hmac('SHA-1', '4S4Rvm25CJZWv7HBg5HOhhlRTBSZ7npl&', base),
    );
  });

  test('realm comes first in the header and is not signed', async () => {
    const request = () => new Request('http://localhost:3737/rest?alt=json');
    const options = { consumer: { key: 'k', secret: 's' }, nonce: 'n', now: new Date(1_000) };
    const header = await OAuth1.authorization(request(), { ...options, realm: 'https://ddo.me/' });
    expect(header.startsWith('OAuth realm="https://ddo.me/", oauth_consumer_key="k", ')).toBe(true);
    expect(parseHeader(header).oauth_signature).toBe(await signature(request(), options));
  });

  test('the header separates parameters with ", " and holds only oauth_ parameters', async () => {
    const header = await OAuth1.authorization(tweet(), twitter);
    expect(header.split(', ')).toHaveLength(7);
    expect(header).not.toContain('status');
    expect(header).not.toContain('include_entities');
  });

  test('the nonce defaults to 32 random characters', async () => {
    const options = { consumer: { key: 'k', secret: 's' } };
    const first = parseHeader(
      await OAuth1.authorization(new Request('https://example.com/'), options),
    );
    const second = parseHeader(
      await OAuth1.authorization(new Request('https://example.com/'), options),
    );
    expect(first.oauth_nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(second.oauth_nonce).not.toBe(first.oauth_nonce);
  });

  test('the timestamp defaults to the current time in seconds', async () => {
    const params = parseHeader(
      await OAuth1.authorization(new Request('https://example.com/'), {
        consumer: { key: 'k', secret: 's' },
      }),
    );
    expect(Math.abs(Number(params.oauth_timestamp) - Date.now() / 1000)).toBeLessThan(5);
  });

  test('the signature method defaults to HMAC-SHA1', async () => {
    const params = parseHeader(
      await OAuth1.authorization(new Request('https://example.com/'), {
        consumer: { key: 'k', secret: 's' },
      }),
    );
    expect(params.oauth_signature_method).toBe('HMAC-SHA1');
  });

  test('a signature method the package does not implement throws UnsupportedError', async () => {
    await expect(
      OAuth1.authorization(new Request('https://example.com/'), {
        signatureMethod: 'RSA-SHA256' as 'HMAC-SHA1',
        consumer: { key: 'k', secret: 's' },
      }),
    ).rejects.toThrow(OAuth1.UnsupportedError);
  });
});

describe('oauth_body_hash, from the oauth-1.0a test suite', () => {
  const lti = {
    consumer: {
      key: '1434affd-4d69-4a1a-bace-cc5c6fe493bc',
      secret: '932a216f-fb94-43b6-a2d2-e9c6b345cbea',
    },
    nonce: 't62lMDp9DLwKZJJbZTpmSAhRINGBEOcF',
    now: new Date(1484599369_000),
    bodyHash: true,
  };

  test('a JSON body is hashed and not signed as parameters', async () => {
    const body = JSON.stringify({
      '@context': ['http://purl.imsglobal.org/ctx/lti/v2/ToolProxy'],
      '@type': 'ToolProxy',
      lti_version: 'LTI-2p1',
      tool_proxy_guid: '0cf04d67-8a0d-4d41-af61-6e8c6fc3e68c',
      tool_consumer_profile:
        'http://canvas.docker/api/lti/accounts/1/tool_consumer_profile/339b6700-e4cb-47c5-a54f-3ee0064921a9',
      tool_profile: {
        lti_version: 'LTI-2p1',
        product_instance: {
          guid: 'fd75124a-140e-470f-944c-114d2d93db40',
          product_info: {
            product_name: { default_value: 'TestTool', key: 'tool.name' },
            product_version: '0.1.0',
            product_family: {
              code: 'testtool',
              vendor: {
                code: 'Example.com',
                vendor_name: { default_value: 'Example', key: 'tool.vendor.name' },
              },
            },
          },
        },
        base_url_choice: [
          {
            default_base_url: 'http://example.docker/',
            selector: { applies_to: ['MessageHandler'] },
          },
        ],
        resource_handler: [
          {
            resource_type: { code: 'testtool' },
            resource_name: { default_value: 'TestTool', key: 'testtool.resource.name' },
            message: [
              {
                message_type: 'basic-lti-launch-request',
                path: 'lti_launch',
                enabled_capability: ['Canvas.placements.courseNavigation'],
              },
            ],
          },
        ],
      },
      enabled_capability: ['OAuth.splitSecret'],
      security_contract: {
        tp_half_shared_secret:
          '1c7849d3c9f037a9891575c8508d3aaab6a9e1312b5d0353625f83d68f0d545344f81ff9e1849b6400982a0d3f6bf953c6095265e3b6d700a73f5be94ce5654c',
      },
    });
    const request = new Request('http://canvas.docker/api/lti/accounts/1/tool_proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.ims.lti.v2.toolproxy+json' },
      body,
    });
    expect(await OAuth1.authorization(request, lti)).toBe(
      'OAuth oauth_body_hash="xpJzRG6xylVIRRtiigLPKX7iRmM%3D", oauth_consumer_key="1434affd-4d69-4a1a-bace-cc5c6fe493bc", oauth_nonce="t62lMDp9DLwKZJJbZTpmSAhRINGBEOcF", oauth_signature="1Q0U8yhK1bWYguRxlUDs9KHywOE%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1484599369", oauth_version="1.0"',
    );
  });

  test('a text body is hashed with SHA-1', async () => {
    const request = new Request('http://canvas.docker/', { method: 'POST', body: 'Hello World!' });
    expect(parseHeader(await OAuth1.authorization(request, lti)).oauth_body_hash).toBe(
      'Lve95gjOVATpfV8EL5X4nxwjKHE=',
    );
  });

  test('a request without a body gets the hash of no bytes', async () => {
    const params = parseHeader(
      await OAuth1.authorization(new Request('http://canvas.docker/'), lti),
    );
    expect(params.oauth_body_hash).toBe('2jmj7l5rSw0yVb/vlWAYkK/YBwk=');
  });

  test('HMAC-SHA256 hashes the body with SHA-256', async () => {
    const params = parseHeader(
      await OAuth1.authorization(new Request('http://canvas.docker/'), {
        ...lti,
        signatureMethod: 'HMAC-SHA256',
      }),
    );
    expect(params.oauth_body_hash).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  test('a form body gets no body hash, because its parameters are signed', async () => {
    const params = parseHeader(await OAuth1.authorization(tweet(), { ...twitter, bodyHash: true }));
    expect(params.oauth_body_hash).toBeUndefined();
    expect(params.oauth_signature).toBe('tnnArxj06cWHq44gCs1OSKk/jLY=');
  });

  test('the body is still readable after authorization()', async () => {
    const request = new Request('http://canvas.docker/', { method: 'POST', body: 'Hello World!' });
    await OAuth1.authorization(request, lti);
    expect(await request.text()).toBe('Hello World!');
  });
});

describe('known oauth-1.0a issues', () => {
  const options = { consumer: { key: 'k', secret: 's' }, nonce: 'n', now: new Date(1_000) };
  const oauthParams =
    'oauth_consumer_key=k&oauth_nonce=n&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_version=1.0';
  const expected = (method: string, uri: string, parameters: string) =>
    hmac('SHA-1', 's&', baseString(method, uri, parameters));

  test('"+" in the query is a space (#24)', async () => {
    expect(await signature(new Request('https://example.com/?q=a+b'), options)).toBe(
      await expected('GET', 'https://example.com/', `${oauthParams}&q=a%20b`),
    );
  });

  test('an encoded "&" or "=" in the query stays part of its value (#24)', async () => {
    expect(await signature(new Request('https://example.com/?q=a%26b%3Dc'), options)).toBe(
      await expected('GET', 'https://example.com/', `${oauthParams}&q=a%26b%3Dc`),
    );
  });

  test('query parameter names are decoded before they are encoded', async () => {
    expect(await signature(new Request('https://example.com/?a%20b=1'), options)).toBe(
      await expected('GET', 'https://example.com/', `a%20b=1&${oauthParams}`),
    );
  });

  test('the default port is left out of the base string (#59)', async () => {
    expect(await signature(new Request('https://example.com:443/x'), options)).toBe(
      await expected('GET', 'https://example.com/x', oauthParams),
    );
  });

  test('the fragment is left out of the base string', async () => {
    expect(await signature(new Request('https://example.com/x#top'), options)).toBe(
      await expected('GET', 'https://example.com/x', oauthParams),
    );
  });

  test('values of one name are sorted by their encoded form', async () => {
    expect(await signature(new Request('https://example.com/?a=-&a=%40'), options)).toBe(
      await expected('GET', 'https://example.com/', `a=%40&a=-&${oauthParams}`),
    );
  });

  test('an empty value does not hide a repeated name', async () => {
    expect(await signature(new Request('https://example.com/?a=&a=b'), options)).toBe(
      await expected('GET', 'https://example.com/', `a=&a=b&${oauthParams}`),
    );
  });

  test('"?&" adds no parameters', async () => {
    expect(await signature(new Request('https://example.com/?&'), options)).toBe(
      await signature(new Request('https://example.com/'), options),
    );
  });

  test('an incomplete escape is signed as literal characters instead of throwing', async () => {
    expect(await signature(new Request('https://example.com/?q=%E0%A4%A'), options)).toBe(
      await expected('GET', 'https://example.com/', `${oauthParams}&q=%E0%A4%25A`),
    );
  });

  test('escaped bytes that are not UTF-8 keep their value', async () => {
    expect(await signature(new Request('https://example.com/?q=caf%E9'), options)).toBe(
      await expected('GET', 'https://example.com/', `${oauthParams}&q=caf%E9`),
    );
  });

  test("!, *, ', ( and ) in form values are percent-encoded (#21, #22)", async () => {
    const request = new Request('https://example.com/', form("q=it's+(a)+*test*!"));
    expect(await signature(request, options)).toBe(
      await expected(
        'POST',
        'https://example.com/',
        `${oauthParams}&q=it%27s%20%28a%29%20%2Atest%2A%21`,
      ),
    );
  });

  test('a JSON body is not signed as parameters (#60, #110)', async () => {
    const json = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'hello' }),
    });
    expect(await signature(json, options)).toBe(
      await signature(new Request('https://example.com/', { method: 'POST' }), options),
    );
  });

  test('a realm with quotes is escaped as an HTTP quoted-string (#50)', async () => {
    const header = await OAuth1.authorization(new Request('https://example.com/'), {
      ...options,
      realm: 'say "hi" \\o/',
    });
    expect(header.startsWith('OAuth realm="say \\"hi\\" \\\\o/", ')).toBe(true);
    expect(parseHeader(header).realm).toBe('say "hi" \\o/');
  });
});
