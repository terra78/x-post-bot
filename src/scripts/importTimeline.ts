import "../config";
import { TwitterApi } from "twitter-api-v2";
import { supabase } from "../lib/supabase";
import { XAccount } from "../types";

type TimelineTweet = {
  id: string;
  text: string;
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
    }>;
  };
};

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const getLimit = (): number => {
  const limitText = getArgValue("--limit") ?? "10";
  const parsed = Number(limitText);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("limit must be positive number");
  }
  return Math.min(parsed, 100);
};

const fetchAccount = async (slug: string): Promise<XAccount> => {
  const { data, error } = await supabase.from("x_accounts").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`failed to load account: ${error.message}`);
  }
  if (!data) {
    throw new Error(`account not found: ${slug}`);
  }
  return data as XAccount;
};

const buildClient = (account: XAccount): TwitterApi => {
  return new TwitterApi({
    appKey: account.x_api_key,
    appSecret: account.x_api_key_secret,
    accessToken: account.x_access_token,
    accessSecret: account.x_access_token_secret
  });
};

const splitPostAndLink = (tweet: TimelineTweet): { content: string; link: string | null } => {
  const urls = tweet.entities?.urls ?? [];
  const linkCandidate = urls.find((url) => url.expanded_url)?.expanded_url ?? null;

  let content = tweet.text;
  // X本文に含まれる t.co を除去して、リンクは別カラムで保持する
  content = content.replace(/https:\/\/t\.co\/[a-zA-Z0-9]+/g, " ");
  content = content.replace(/\s+/g, " ").trim();

  if (!content) {
    content = tweet.text.trim();
  }

  return { content, link: linkCandidate };
};

const alreadyExists = async (accountId: string, content: string, link: string | null): Promise<boolean> => {
  let query = supabase
    .from("post_contents")
    .select("id")
    .eq("account_id", accountId)
    .eq("content", content)
    .limit(1);
  query = link ? query.eq("link", link) : query.is("link", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`failed to check duplicate: ${error.message}`);
  }
  return Boolean(data);
};

const insertPost = async (accountId: string, content: string, link: string | null): Promise<void> => {
  const { error } = await supabase.from("post_contents").insert({
    account_id: accountId,
    content,
    link,
    is_active: true
  });
  if (error) {
    throw new Error(`failed to insert post content: ${error.message}`);
  }
};

const main = async (): Promise<void> => {
  const accountSlug = getArgValue("--account-slug");
  if (!accountSlug) {
    throw new Error("account slug is required. use --account-slug <slug>");
  }

  const username = getArgValue("--username") ?? accountSlug;
  const limit = getLimit();

  const account = await fetchAccount(accountSlug);
  const client = buildClient(account);

  const user = await client.v2.userByUsername(username);
  const timeline = await client.v2.userTimeline(user.data.id, {
    max_results: limit,
    exclude: ["replies", "retweets"],
    "tweet.fields": ["entities"]
  });

  const tweets = (timeline.tweets as unknown as TimelineTweet[]) ?? [];
  let inserted = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const { content, link } = splitPostAndLink(tweet);
    if (!content) {
      skipped += 1;
      continue;
    }

    if (await alreadyExists(account.id, content, link)) {
      skipped += 1;
      continue;
    }

    await insertPost(account.id, content, link);
    inserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        accountSlug,
        username,
        fetched: tweets.length,
        inserted,
        skipped
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
