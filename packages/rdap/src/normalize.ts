/**
 * A contact, with its jCard (RFC 7095) reduced to the first value of each common property. The
 * raw jCard is in `raw` of the result, under `entities[].vcardArray`.
 */
export type Entity = {
  /** The registry's handle, such as `292` for MarkMonitor or `ZG39-ARIN`. */
  handle: string | undefined;
  /** RDAP roles (RFC 9083 section 10.2.4), such as `registrar`, `registrant`, `abuse`, or `technical`. */
  roles: readonly string[];
  /** The jCard `fn`: the formatted name of a person or organization. */
  name: string | undefined;
  /** The jCard `org`. */
  org: string | undefined;
  email: string | undefined;
  /** The first `tel` that isn't a fax number, without the `tel:` prefix. */
  phone: string | undefined;
  /** The `adr` label, or its parts joined by line breaks. */
  address: string | undefined;
};

/**
 * The registration, expiration, and last-changed dates. Each one is `undefined` when the response
 * doesn't have the event or its date is unreadable.
 */
export type Events = {
  registration: Date | undefined;
  expiration: Date | undefined;
  lastChanged: Date | undefined;
};

type Common = {
  handle: string | undefined;
  /** RDAP status values (RFC 9083 section 10.2.2), lowercased, such as `client transfer prohibited`. */
  status: readonly string[];
  events: Events;
  /** Every entity in the response, with entities nested inside another one listed after it. */
  entities: readonly Entity[];
  /** The response JSON. */
  raw: Record<string, unknown>;
};

/** The registrar's response that a registry pointed to with a `related` link. */
export type Referral =
  | { url: string; raw: Record<string, unknown>; error?: undefined }
  | { url: string; raw?: undefined; error: unknown };

/** A domain, as `Rdap.domain` returns it. */
export type Domain = Common & {
  /** The name in lowercase A-labels, without a trailing dot. */
  name: string;
  /** The name in U-labels, when the server sent one. */
  unicodeName: string | undefined;
  /** Host names in lowercase, without a trailing dot. */
  nameservers: readonly string[];
  /** The registrar's response, when the registry linked to one and `follow` was on. */
  referral: Referral | undefined;
};

/** An IP network, as `Rdap.ip` returns it. */
export type Network = Common & {
  name: string | undefined;
  version: 4 | 6 | undefined;
  startAddress: string | undefined;
  endAddress: string | undefined;
  /** Prefixes from the `cidr0` extension, which every RIR sends, such as `8.8.8.0/24`. */
  cidrs: readonly string[];
  /** The RIR's allocation type, such as `DIRECT ALLOCATION` or `ASSIGNED PA`. */
  type: string | undefined;
  country: string | undefined;
  parentHandle: string | undefined;
};

/** An autonomous system number range, as `Rdap.asn` returns it. */
export type Autnum = Common & {
  name: string | undefined;
  start: number | undefined;
  end: number | undefined;
  type: string | undefined;
  country: string | undefined;
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function text(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return text(value[0]);
  }
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function hostname(value: unknown): string | undefined {
  return string(value)?.toLowerCase().replace(/\.$/, '');
}

function date(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const zoned = /T[\d:.]+$/.test(value) ? `${value}Z` : value;
  const time = Date.parse(zoned);
  return Number.isNaN(time) ? undefined : new Date(time);
}

function isFax(params: unknown): boolean {
  if (!isObject(params)) {
    return false;
  }
  const type = params.type;
  return Array.isArray(type) ? type.includes('fax') : type === 'fax';
}

function address(params: unknown, value: unknown): string | undefined {
  const label = isObject(params) ? text(params.label) : undefined;
  if (label) {
    return label;
  }
  const parts = list(value)
    .flat()
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function entity(json: Json): Entity {
  const result: Entity = {
    handle: string(json.handle),
    roles: list(json.roles)
      .filter((role) => typeof role === 'string')
      .map((role) => role.toLowerCase()),
    name: undefined,
    org: undefined,
    email: undefined,
    phone: undefined,
    address: undefined,
  };
  for (const property of list(list(json.vcardArray)[1])) {
    if (!Array.isArray(property) || typeof property[0] !== 'string') {
      continue;
    }
    const [, params, , value] = property;
    switch (property[0].toLowerCase()) {
      case 'fn':
        result.name ??= text(value);
        break;
      case 'org':
        result.org ??= text(value);
        break;
      case 'email':
        result.email ??= text(value);
        break;
      case 'tel':
        if (!isFax(params)) {
          result.phone ??= text(value)?.replace(/^tel:/i, '');
        }
        break;
      case 'adr':
        result.address ??= address(params, value);
        break;
    }
  }
  return result;
}

function entities(value: unknown, out: Entity[] = []): Entity[] {
  for (const item of list(value)) {
    if (isObject(item)) {
      out.push(entity(item));
      entities(item.entities, out);
    }
  }
  return out;
}

function events(value: unknown): Events {
  const result: Events = { registration: undefined, expiration: undefined, lastChanged: undefined };
  for (const event of list(value)) {
    if (!isObject(event) || typeof event.eventAction !== 'string') {
      continue;
    }
    const action = event.eventAction.toLowerCase();
    if (action === 'registration') {
      result.registration ??= date(event.eventDate);
    } else if (action === 'expiration') {
      result.expiration ??= date(event.eventDate);
    } else if (action === 'last changed') {
      result.lastChanged ??= date(event.eventDate);
    }
  }
  return result;
}

function common(json: Json): Common {
  return {
    handle: string(json.handle),
    status: list(json.status)
      .filter((status) => typeof status === 'string')
      .map((status) => status.toLowerCase()),
    events: events(json.events),
    entities: entities(json.entities),
    raw: json,
  };
}

export function toDomain(json: Json, name: string): Domain {
  return {
    ...common(json),
    name: hostname(json.ldhName) || name,
    unicodeName: string(json.unicodeName)?.replace(/\.$/, ''),
    nameservers: list(json.nameservers).flatMap((server) => {
      const host = isObject(server) ? hostname(server.ldhName) : undefined;
      return host ? [host] : [];
    }),
    referral: undefined,
  };
}

export function toNetwork(json: Json): Network {
  const version = json.ipVersion === 'v4' ? 4 : json.ipVersion === 'v6' ? 6 : undefined;
  return {
    ...common(json),
    name: string(json.name),
    version,
    startAddress: string(json.startAddress),
    endAddress: string(json.endAddress),
    cidrs: list(json.cidr0_cidrs).flatMap((cidr) => {
      if (!isObject(cidr)) {
        return [];
      }
      const prefix = string(cidr.v4prefix) ?? string(cidr.v6prefix);
      const length = number(cidr.length);
      return prefix && length !== undefined ? [`${prefix}/${length}`] : [];
    }),
    type: string(json.type),
    country: string(json.country),
    parentHandle: string(json.parentHandle),
  };
}

export function toAutnum(json: Json): Autnum {
  return {
    ...common(json),
    name: string(json.name),
    start: number(json.startAutnum),
    end: number(json.endAutnum),
    type: string(json.type),
    country: string(json.country),
  };
}

export function relatedLink(json: Json, self: string): string | undefined {
  for (const link of list(json.links)) {
    if (!isObject(link) || link.rel !== 'related' || typeof link.href !== 'string') {
      continue;
    }
    if (typeof link.type === 'string' && !/^application\/(?:rdap\+)?json\b/i.test(link.type)) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      continue;
    }
    if (!/\/domain\/[^/]+$/i.test(url.pathname) || url.href === new URL(self).href) {
      continue;
    }
    return url.href;
  }
  return undefined;
}

/**
 * Adds the registrar's response. Entities come from the registrar, which has the contacts, plus
 * registry entities in roles the registrar has no entity for. All other fields stay as the
 * registry sent them, because the registry is the authority for status, dates, and nameservers.
 */
export function withReferral(result: Domain, url: string, json: Json): Domain {
  const theirs = entities(json.entities);
  const roles = new Set(theirs.flatMap((item) => item.roles));
  const kept = result.entities.filter((item) => !item.roles.some((role) => roles.has(role)));
  return { ...result, entities: [...theirs, ...kept], referral: { url, raw: json } };
}
