import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { XMLParser, XMLValidator } from "npm:fast-xml-parser@4.5.4";

const ALLOWED_ORIGINS = new Set(["https://selim306306.github.io"]);
const MAX_RESPONSE_BYTES = 2_000_000;
const CACHE_TTL_MS = 3 * 60 * 1000;

const SOURCES = [
  {
    id: "un",
    feed: "https://news.un.org/feed/subscribe/ar/news/all/rss.xml",
    allowedHosts: ["news.un.org", "un.org"],
  },
  {
    id: "bbc",
    feed: "https://feeds.bbci.co.uk/arabic/rss.xml",
    allowedHosts: ["bbc.com", "bbc.co.uk"],
  },
] as const;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
});

type FeedItem = { title: string; description: string; pubDate: string; link: string };
type FeedResult = { id: string; status: "ok" | "error"; items: FeedItem[] };
type NewsPayload = { status: "ok"; fetched_at: string; sources: FeedResult[] };

let cachedPayload: NewsPayload | null = null;
let cacheExpiresAt = 0;

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function stringValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return stringValue(record["#text"] ?? record["__cdata"] ?? record["@_href"] ?? record.href ?? "");
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
}

function allowedArticleUrl(value: string, allowedHosts: readonly string[]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const hostAllowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return hostAllowed ? url.href : "";
  } catch {
    return "";
  }
}

function rejectXmlDeclarations(xml: string) {
  if (/<\s*!DOCTYPE\b/i.test(xml) || /<\s*!ENTITY\b/i.test(xml)) {
    throw new Error("unsupported_xml_declaration");
  }
}

async function fetchFeed(source: (typeof SOURCES)[number]): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(source.feed, {
      method: "GET",
      headers: {
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent": "BorsaidSchoolLibraryNews/1.0 (+https://selim306306.github.io/borsaid-school-library/)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("upstream_http_error");
    const xml = await response.text();
    if (new TextEncoder().encode(xml).byteLength > MAX_RESPONSE_BYTES) throw new Error("upstream_response_too_large");
    rejectXmlDeclarations(xml);
    if (XMLValidator.validate(xml) !== true) throw new Error("invalid_xml");
    const parsed = xmlParser.parse(xml) as Record<string, any>;
    const candidates = asArray(parsed?.rss?.channel?.item ?? parsed?.feed?.entry);
    const now = Date.now();

    return candidates.slice(0, 40).map((entry) => {
      const title = stringValue(entry.title).slice(0, 300);
      const description = stringValue(entry.description ?? entry.summary ?? entry["content:encoded"] ?? entry.content).slice(0, 5000);
      const pubDate = stringValue(entry.pubDate ?? entry.published ?? entry.updated ?? entry.date);
      const link = allowedArticleUrl(stringValue(entry.link), source.allowedHosts);
      const time = Date.parse(pubDate);
      if (!title || !link || !Number.isFinite(time) || time > now + 5 * 60 * 1000) return null;
      return { title, description, pubDate: new Date(time).toISOString(), link };
    }).filter((item): item is FeedItem => item !== null);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadNews(): Promise<NewsPayload> {
  const sources = await Promise.all(SOURCES.map(async (source): Promise<FeedResult> => {
    try {
      return { id: source.id, status: "ok", items: await fetchFeed(source) };
    } catch (error) {
      console.error("education-news source fetch failed", source.id, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      return { id: source.id, status: "error", items: [] };
    }
  }));
  if (sources.every((source) => source.status === "error")) throw new Error("all_sources_unavailable");
  return { status: "ok", fetched_at: new Date().toISOString(), sources };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return jsonResponse({ status: "error", message: "method_not_allowed" }, 405, origin);
  }

  try {
    if (!cachedPayload || Date.now() >= cacheExpiresAt) {
      cachedPayload = await loadNews();
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }
    return jsonResponse(cachedPayload, 200, origin);
  } catch {
    return jsonResponse({ status: "error", message: "news_sources_unavailable" }, 502, origin);
  }
});
