import "../config";
import { supabase } from "../lib/supabase";
import { runPostingForAccount } from "../services/postRunner";
import { XAccount } from "../types";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const isRetryableSupabaseError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("upstream request timeout") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("connection")
  );
};

const fetchAccountBySlugOnce = async (slug: string): Promise<XAccount | null> => {
  const { data, error } = await supabase
    .from("x_accounts")
    .select("*")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to fetch account by slug: ${error.message}`);
  }

  return (data as XAccount | null) ?? null;
};

const fetchAccountBySlug = async (slug: string): Promise<XAccount | null> => {
  const maxAttempts = 4; // 初回 + リトライ3回
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchAccountBySlugOnce(slug);
    } catch (error) {
      const currentError = error instanceof Error ? error : new Error(String(error));
      lastError = currentError;
      const canRetry = isRetryableSupabaseError(currentError.message);
      if (!canRetry || attempt === maxAttempts) {
        throw currentError;
      }
      const delayMs = 500 * (2 ** (attempt - 1));
      await wait(delayMs);
    }
  }

  throw lastError ?? new Error("failed to fetch account by slug");
};

const main = async (): Promise<void> => {
  const slugArg = getArgValue("--account-slug");
  const slugFromEnv = process.env.ACCOUNT_SLUG;
  const accountSlug = slugArg ?? slugFromEnv;
  if (!accountSlug) {
    throw new Error("account slug is required. use --account-slug <slug> or ACCOUNT_SLUG");
  }

  const account = await fetchAccountBySlug(accountSlug);
  if (!account) {
    throw new Error(`enabled account not found for slug=${accountSlug}`);
  }

  console.log(`posting for ${account.slug}`);
  await runPostingForAccount(account);
  console.log(`posted for ${account.slug}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
