/**
 * wishkov-proxy — read-only proxy for public Wishkov wishlists.
 * GET /?list=<slug>  slug: [a-z0-9]+
 * Fetches only https://wishkov.ru/w/<slug>/ and returns parsed items.
 * Not an open proxy: the client cannot pass an arbitrary URL.
 */

const ALLOWED_HOSTS = new Set(['wishkov.ru', 'www.wishkov.ru']);
const CACHE_TTL = 300;
const LIST_RE = /^[a-z0-9]+$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Только GET' }, 405);
    }

    const reqUrl = new URL(request.url);
    if (reqUrl.pathname !== '/' && reqUrl.pathname !== '') {
      return json({ error: 'Не найден' }, 404);
    }

    const slug = String(reqUrl.searchParams.get('list') || '').trim().toLowerCase();
    if (!LIST_RE.test(slug)) {
      return json({ error: 'Укажи код вишлиста: только латинские буквы и цифры, или ссылку вида wishkov.ru/w/…' }, 400);
    }

    const src = 'https://wishkov.ru/w/' + slug + '/';
    let res;
    try {
      res = await fetch(src, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'wishkov-proxy/1.0 (coffee jar import)',
        },
      });
    } catch (err) {
      return json({ error: 'Не удалось открыть вишлист на wishkov.ru' }, 502);
    }

    let finalHost = '';
    try {
      finalHost = new URL(res.url).hostname;
    } catch (err) {
      return json({ error: 'Неожиданный ответ от Вишкова' }, 502);
    }
    if (!ALLOWED_HOSTS.has(finalHost)) {
      return json({ error: 'Отказ: редирект ушёл с wishkov.ru' }, 502);
    }

    if (res.status === 404) {
      return json({ error: 'Вишлист не найден. Проверь ссылку и что список открыт по ссылке.' }, 404);
    }
    if (!res.ok) {
      return json({ error: 'Вишков сейчас не отвечает, попробуй чуть позже' }, 502);
    }

    const html = await res.text();
    if (/<title>\s*Войти/i.test(html) || looksPrivateOrMissing(html)) {
      return json({ error: 'Вишлист не найден или закрыт. Проверь ссылку и доступ «по ссылке» / «всем».' }, 404);
    }

    const items = parseWishlist(html);
    return json({ items }, 200, { 'Cache-Control': 'public, max-age=' + CACHE_TTL });
  },
};

function looksPrivateOrMissing(html) {
  // Public lists render item cards; login/404 pages do not.
  if (/itemCard\d+/.test(html) || /class="card-title"/.test(html)) return false;
  if (/не найден|не найден[ао]|доступ закрыт|только мне|страница не найдена/i.test(html)) return true;
  // An empty but accessible list still has the wishlist chrome (e.g. share drawer).
  if (/Поделиться вишлистом|id="shareDrawer"/.test(html)) return false;
  return false;
}

export function parseWishlist(html) {
  const items = [];
  const seen = new Set();
  const re = /<article\b[^>]*\bid="itemCard(\d+)"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const body = m[2];
    const title = textOf(attrBlock(body, 'id="itemTitle' + id + '"')) || textOf(classBlock(body, 'card-title'));
    if (!title) continue;
    const priceRaw = textOf(attrBlock(body, 'id="itemPrice' + id + '"')) || textOf(classBlock(body, 'price'));
    const price = parsePrice(priceRaw);
    const href = (body.match(/href="(\/go\/wishlist\/\d+\/)"/) || [])[1];
    const url = href ? 'https://wishkov.ru' + href : null;
    if (url) {
      if (seen.has(url)) continue;
      seen.add(url);
    }
    const image = (body.match(/<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/i) || [])[1] || null;
    items.push({ title, price, url, image });
  }
  return items;
}

function attrBlock(html, needle) {
  const i = html.indexOf(needle);
  if (i < 0) return '';
  const start = html.lastIndexOf('<', i);
  const end = html.indexOf('</div>', i);
  if (start < 0 || end < 0) return '';
  return html.slice(start, end + 6);
}

function classBlock(html, cls) {
  const re = new RegExp('<div[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([\\s\\S]*?)</div>', 'i');
  const m = html.match(re);
  return m ? m[0] : '';
}

function textOf(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(raw) {
  if (!raw) return null;
  const digits = String(raw)
    .replace(/[\s\u00a0\u202f\u2009\u2007]/g, '')
    .replace(/[₽руб.]/gi, '')
    .replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS,
      ...(extra || {}),
    },
  });
}
