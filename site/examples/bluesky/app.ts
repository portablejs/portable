import * as Streams from '@portable/streams';
import * as WebSockets from '@portable/websockets';

type Blob = { image?: { ref?: { $link?: string | undefined } | undefined } | undefined };
type Embed = {
  $type?: string | undefined;
  images?: readonly Blob[] | undefined;
  media?: { images?: readonly Blob[] | undefined } | undefined;
};
type Post = {
  did: string;
  time_us: number;
  commit?:
    | {
        operation: string;
        collection: string;
        rkey: string;
        record?:
          | {
              text?: string | undefined;
              langs?: string[] | undefined;
              embed?: Embed | undefined;
              reply?: unknown;
            }
          | undefined;
      }
    | undefined;
};
type Item = {
  text: string;
  full: string;
  thumb: string | undefined;
  y: number;
  url: string;
  replayed: boolean;
  media: boolean;
  reply: boolean;
};
type Column = {
  lang: string;
  label: string;
  items: Item[];
  recent: number[];
  total: number;
  pausedAt: number | undefined;
  catchUp: { until: number; pending: Post[]; replayed: number } | undefined;
  note: { text: string; until: number } | undefined;
};

const canvas = document.getElementById('rain') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;
const tip = document.getElementById('tip')!;
let mouse: { x: number; y: number } | undefined;
let tipItem: Item | undefined;

const LINE = 17;
const HEADER = 46;
const FONT = '12.5px ui-sans-serif, system-ui, -apple-system, sans-serif';
const names = new Intl.DisplayNames(['en'], { type: 'language' });
const ACCENT = '#fc7c00';
const TEXT = 'rgba(230,233,239,0.92)';
const REPLY = 'rgba(230,233,239,0.6)';
const DIM = '#8a93a6';

let width = 0;
let height = 0;
let columns: Column[] = [];
const byLang = new Map<string, Column>();
const langTotals = new Map<string, number>();
let total = 0;

function label(lang: string) {
  if (lang === 'other') {
    return 'Other';
  }
  if (lang === '?') {
    return 'No language';
  }
  try {
    return names.of(lang) ?? lang;
  } catch {
    return lang;
  }
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  layout();
}

function columnCount() {
  return Math.max(2, Math.min(10, Math.floor(width / 170)));
}

function layout() {
  if (columns.some((column) => column.pausedAt !== undefined || column.catchUp)) {
    return;
  }
  const count = columnCount();
  const ranked = [...langTotals]
    .filter(([lang]) => lang !== '?')
    .sort((a, b) => b[1] - a[1])
    .slice(0, count - 1)
    .map(([lang]) => lang);
  const kept = columns.map((column) => column.lang).filter((lang) => ranked.includes(lang));
  const wanted = [...kept, ...ranked.filter((lang) => !kept.includes(lang)), 'other'];
  const next: Column[] = [];
  for (const lang of wanted) {
    next.push(
      byLang.get(lang) ?? {
        lang,
        label: label(lang),
        items: [],
        recent: [],
        total: 0,
        pausedAt: undefined,
        catchUp: undefined,
        note: undefined,
      },
    );
  }
  byLang.clear();
  for (const column of next) {
    byLang.set(column.lang, column);
  }
  columns = next;
}

function truncate(text: string, max: number) {
  ctx.font = FONT;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (ctx.measureText(clean).width <= max) {
    return clean;
  }
  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (ctx.measureText(clean.slice(0, mid) + '…').width <= max) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return clean.slice(0, low) + '…';
}

function langOf(post: Post) {
  return post.commit!.record!.langs?.[0]?.split('-')[0]?.toLowerCase() ?? '?';
}

function columnFor(lang: string) {
  return byLang.get(lang) ?? byLang.get('other')!;
}

function receive(post: Post) {
  const lang = langOf(post);
  langTotals.set(lang, (langTotals.get(lang) ?? 0) + 1);
  total++;
  const now = performance.now();
  const column = columnFor(lang);
  column.recent.push(now);
  column.total++;
  if (column.pausedAt !== undefined) {
    return;
  }
  if (column.catchUp) {
    column.catchUp.pending.push(post);
    return;
  }
  draw(column, post, false);
}

function draw(column: Column, post: Post, replayed: boolean) {
  const record = post.commit!.record!;
  const columnWidth = width / columns.length;
  const last = column.items[column.items.length - 1];
  const y = Math.min(HEADER, (last?.y ?? HEADER) - LINE);
  const media =
    record.embed?.$type?.includes('images') ||
    record.embed?.$type?.includes('video') ||
    record.embed?.$type?.includes('recordWithMedia');
  column.items.push({
    text: truncate(record.text || (media ? '[media]' : ''), columnWidth - 30),
    full: record.text || '[media]',
    thumb: (() => {
      const cid = (record.embed?.images ?? record.embed?.media?.images)?.[0]?.image?.ref?.$link;
      return cid
        ? `https://cdn.bsky.app/img/feed_thumbnail/plain/${post.did}/${cid}@jpeg`
        : undefined;
    })(),
    y,
    url: `https://bsky.app/profile/${post.did}/post/${post.commit!.rkey}`,
    replayed,
    media: Boolean(media),
    reply: Boolean(record.reply),
  });
}

let shownTotal = -1;
let previous = performance.now();
let frames = 0;
let fps = 0;
let fpsAt = previous;

function frame(now: number) {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  frames++;
  if (now - fpsAt > 1000) {
    fps = frames;
    frames = 0;
    fpsAt = now;
    (window as unknown as { fps: number }).fps = fps;
  }
  const columnWidth = width / columns.length;
  ctx.clearRect(0, 0, width, height);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  const hoveredIndex = mouse ? Math.floor((mouse.x / width) * columns.length) : -1;
  let hoveredItem: Item | undefined;
  for (const [index, column] of columns.entries()) {
    const x = index * columnWidth;
    const paused = column === hovered || column.pausedAt !== undefined;
    const hoveredColumn = index === hoveredIndex;
    const queued = column.items.length
      ? Math.max(0, HEADER - column.items[column.items.length - 1]!.y)
      : 0;
    const speed = paused ? 0 : Math.min(2500, 30 + queued * 2.2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, columnWidth, height);
    ctx.clip();
    let keep = 0;
    for (const item of column.items) {
      item.y += speed * dt;
      if (item.y < height + LINE) {
        column.items[keep++] = item;
      }
    }
    column.items.length = keep;

    if (index > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, 0, 1, height);
    }
    for (const item of column.items) {
      if (item.y < HEADER - 2) {
        continue;
      }
      const fade =
        Math.min(1, (item.y - HEADER + 4) / 40) * Math.min(1, (height - item.y) / 80 + 0.15);
      ctx.globalAlpha = Math.max(0, fade);
      if (hoveredColumn && mouse && Math.abs(item.y - mouse.y) < LINE / 2) {
        hoveredItem = item;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 4, item.y - LINE / 2, columnWidth - 8, LINE);
      }
      const hovered = item === hoveredItem;
      let textX = x + 12;
      if (item.media) {
        ctx.strokeStyle = DIM;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 12.5, item.y - 4.5, 10, 9);
        ctx.beginPath();
        ctx.moveTo(x + 13, item.y + 4);
        ctx.lineTo(x + 17, item.y);
        ctx.lineTo(x + 22, item.y + 4);
        ctx.stroke();
        textX += 15;
      }
      ctx.fillStyle = hovered ? '#ffffff' : item.replayed ? ACCENT : item.reply ? REPLY : TEXT;
      ctx.fillText(item.text, textX, item.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    while (column.recent.length && column.recent[0]! < now - 5000) {
      column.recent.shift();
    }
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(x + 1, 0, columnWidth - 1, HEADER - 8);
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#e6e9ef';
    ctx.fillText(column.label, x + 12, 16);
    const tag = paused
      ? 'paused'
      : column.catchUp
        ? 'catching up'
        : column.note && column.note.until > now
          ? column.note.text
          : undefined;
    ctx.font = FONT;
    ctx.fillStyle = tag ? ACCENT : DIM;
    ctx.fillText(tag ?? `${Math.round(column.recent.length / 5)} posts/sec`, x + 12, 32);
    ctx.font = FONT;
  }
  if (total !== shownTotal) {
    shownTotal = total;
    seenEl.textContent = total.toLocaleString();
  }
  if (hoveredItem && mouse) {
    if (tipItem !== hoveredItem) {
      tipItem = hoveredItem;
      const text = document.createElement('div');
      text.textContent = hoveredItem.full;
      tip.replaceChildren(text);
      if (hoveredItem.thumb) {
        const image = document.createElement('img');
        image.src = hoveredItem.thumb;
        image.alt = '';
        tip.append(image);
      }
    }
    tip.style.display = 'block';
    const left = Math.min(mouse.x + 14, width - tip.offsetWidth - 8);
    const top =
      mouse.y + 18 + tip.offsetHeight > height ? mouse.y - tip.offsetHeight - 10 : mouse.y + 18;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  } else {
    tip.style.display = 'none';
    tipItem = undefined;
  }
  requestAnimationFrame(frame);
}

let hovered: Column | undefined;

function hover(column: Column | undefined) {
  if (column === hovered) {
    return;
  }
  if (hovered) {
    resumeColumn(hovered);
  }
  hovered = column;
  if (column) {
    pauseColumn(column);
  }
}

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  hover(columns[Math.floor((mouse.x / width) * columns.length)]);
});
canvas.addEventListener('mouseleave', () => {
  mouse = undefined;
  hover(undefined);
});

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const column = columns[Math.floor(((event.clientX - rect.left) / width) * columns.length)];
  const y = event.clientY - rect.top;
  const item = column?.items.find((candidate) => Math.abs(candidate.y - y) < LINE / 2);
  if (item) {
    window.open(item.url, '_blank', 'noopener');
  }
});

new ResizeObserver(resize).observe(canvas);
resize();
requestAnimationFrame(frame);
setInterval(() => {
  layout();
}, 1000);

let cursor: number | undefined;

function jetstream(from: number | undefined) {
  const url = new URL('wss://jetstream2.us-east.bsky.network/subscribe');
  url.searchParams.set('wantedCollections', 'app.bsky.feed.post');
  if (from) {
    url.searchParams.set('cursor', String(from));
  }
  return url;
}

function shortUrl(url: string | URL) {
  const shown = new URL(url);
  shown.searchParams.delete('wantedCollections');
  return shown.toString().replace('wss://jetstream2.us-east.bsky.network', '…');
}

function time(us: number) {
  return new Date(us / 1000).toLocaleTimeString();
}

const cState = document.getElementById('c-state')!;
const cCursor = document.getElementById('c-cursor')!;
const cUrl = document.getElementById('c-url')!;
const cCatch = document.getElementById('c-catch')!;

let state = 'connecting';

const seenEl = document.createElement('b');

function showStatus() {
  if (state === 'live') {
    statusEl.replaceChildren(seenEl, ' posts since you arrived');
  } else if (state === 'connecting') {
    statusEl.textContent = total
      ? 'Reconnecting from the last post seen…'
      : 'Connecting to Bluesky…';
  } else {
    statusEl.textContent = 'Disconnected. Retrying…';
  }
}

function setStatus(text: string) {
  state = text;
  cState.textContent = text;
  showStatus();
}

class TrackedWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    cUrl.textContent = shortUrl(url);
    setStatus('connecting');
    this.addEventListener('open', () => setStatus('live'));
    this.addEventListener('close', () => setStatus('offline'));
  }
}

let shownCursor: number | undefined;
setInterval(() => {
  if (cursor !== shownCursor) {
    shownCursor = cursor;
    cCursor.textContent = cursor ? `${cursor} (${time(cursor)})` : 'none yet';
  }
}, 100);

function pauseColumn(column: Column) {
  if (column.pausedAt !== undefined || column.catchUp || !cursor) {
    return;
  }
  column.pausedAt = cursor;
  cCatch.textContent = `${column.label} paused at ${column.pausedAt} (${time(column.pausedAt)}). Its new posts are dropped, not buffered.`;
}

function resumeColumn(column: Column) {
  if (column.pausedAt === undefined || !cursor) {
    return;
  }
  const from = column.pausedAt;
  column.pausedAt = undefined;
  column.catchUp = { until: cursor, pending: [], replayed: 0 };
  void catchUp(column, from).finally(() => {
    const done = column.catchUp!;
    column.catchUp = undefined;
    for (const post of done.pending) {
      draw(column, post, false);
    }
    column.note = { text: `+${done.replayed} replayed`, until: performance.now() + 3000 };
    cCatch.textContent = `${column.label}: replayed ${done.replayed} posts from ${from}, then closed the catch-up socket.`;
  });
}

async function catchUp(column: Column, from: number) {
  const { until } = column.catchUp!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const url = jetstream(from);
  cCatch.textContent = `${column.label}: catch-up socket open at ${shortUrl(url)}, replaying until ${until}…`;
  const { readable } = WebSockets.connect(url, { signal: controller.signal, attempts: 2 });
  try {
    for await (const message of Streams.toAsyncIterable(readable)) {
      const post = JSON.parse(message as string) as Post;
      if (post.time_us > until) {
        break;
      }
      if (
        post.commit?.operation === 'create' &&
        post.commit.collection === 'app.bsky.feed.post' &&
        post.commit.record &&
        columnFor(langOf(post)) === column
      ) {
        draw(column, post, true);
        column.catchUp!.replayed++;
      }
    }
  } catch {
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function start() {
  const { readable } = WebSockets.connect(() => jetstream(cursor), { WebSocket: TrackedWebSocket });
  for await (const message of Streams.toAsyncIterable(readable)) {
    if (typeof message !== 'string') {
      continue;
    }
    const post = JSON.parse(message) as Post;
    if (cursor && post.time_us <= cursor) {
      continue;
    }
    cursor = post.time_us;
    if (
      post.commit?.operation !== 'create' ||
      post.commit.collection !== 'app.bsky.feed.post' ||
      !post.commit.record
    ) {
      continue;
    }
    receive(post);
  }
}

void start();
