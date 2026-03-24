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

const fetchDueAccounts = async (): Promise<XAccount[]> => {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  const { data, error } = await supabase
    .from("x_accounts")
    .select("*")
    .eq("enabled", true)
    .eq("posting_hour_utc", hour)
    .eq("posting_minute_utc", minute);

  if (error) {
    throw new Error(`failed to fetch due accounts: ${error.message}`);
  }

  return (data ?? []) as XAccount[];
};

const main = async (): Promise<void> => {
  const slugArg = getArgValue("--account-slug");
  const slugFromEnv = process.env.ACCOUNT_SLUG;
  const accountSlug = slugArg ?? slugFromEnv;

  const targets: XAccount[] = [];

  if (accountSlug) {
    const account = await fetchAccountBySlug(accountSlug);
    if (!account) {
      throw new Error(`enabled account not found for slug=${accountSlug}`);
    }
    targets.push(account);
  } else {
    const dueAccounts = await fetchDueAccounts();
    targets.push(...dueAccounts);
  }

  if (targets.length === 0) {
    console.log("no account is due");
    return;
  }

  for (const account of targets) {
    console.log(`posting for ${account.slug}`);
    await runPostingForAccount(account);
    console.log(`posted for ${account.slug}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
