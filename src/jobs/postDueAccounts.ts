import "../config";
import { supabase } from "../lib/supabase";
import { runPostingForAccount } from "../services/postRunner";
import { XAccount } from "../types";

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const fetchAccountBySlug = async (slug: string): Promise<XAccount | null> => {
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
