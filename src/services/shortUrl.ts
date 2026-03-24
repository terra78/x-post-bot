import { supabase } from "../lib/supabase";

interface ShortLinkRecord {
  original_url: string;
  short_url: string;
}

const getCachedShortLink = async (url: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("short_links")
    .select("short_url")
    .eq("original_url", url)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.short_url ?? null;
};

const cacheShortLink = async (originalUrl: string, shortUrl: string): Promise<void> => {
  await supabase.from("short_links").upsert(
    {
      original_url: originalUrl,
      short_url: shortUrl
    } satisfies ShortLinkRecord,
    { onConflict: "original_url" }
  );
};

export const shortenUrlIfNeeded = async (url: string | null): Promise<string | null> => {
  if (!url) {
    return null;
  }

  const cached = await getCachedShortLink(url);
  if (cached) {
    return cached;
  }

  const requestUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
  const response = await fetch(requestUrl);
  const text = (await response.text()).trim();

  if (!response.ok || text.startsWith("Error:")) {
    return url;
  }

  await cacheShortLink(url, text);
  return text;
};
