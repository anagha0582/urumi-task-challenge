const STORE_URL = process.env.WOOCOMMERCE_URL;
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET;

if (!STORE_URL || !CONSUMER_KEY || !CONSUMER_SECRET) {
  throw new Error(
    "Missing required environment variables: WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET",
  );
}

const apiBase = `${STORE_URL.replace(/\/+$/, "")}/wp-json/wc/v3`;

export async function wooRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";

  // new URL keeps any query string already in `path` (e.g. "products?per_page=20")
  const url = new URL(`${apiBase}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("consumer_key", CONSUMER_KEY!);
  url.searchParams.set("consumer_secret", CONSUMER_SECRET!);

  const res = await fetch(url, {
    method,
    headers: {
      // In-cluster calls are plain HTTP. WooCommerce only checks API keys when it believes the request is HTTPS.
      "X-Forwarded-Proto": "https",
      Accept: "application/json",
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    // Never include `url` here: it contains the credentials.
    const d = data as { code?: string; message?: string } | null;
    throw new Error(`WooCommerce ${res.status} ${d?.code ?? "error"}: ${d?.message ?? res.statusText}`);
  }
  return data as T;
}