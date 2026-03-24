import "../config";
import { createHash } from "crypto";
import { TwitterApi } from "twitter-api-v2";
import { supabase } from "../lib/supabase";
import { XAccount } from "../types";

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const fetchAccount = async (slug: string): Promise<XAccount> => {
  const { data, error } = await supabase.from("x_accounts").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`failed to fetch account: ${error.message}`);
  }
  if (!data) {
    throw new Error(`account not found: ${slug}`);
  }

  return data as XAccount;
};

const maskPrefix = (value: string, visible = 6): string => {
  if (!value) {
    return "(empty)";
  }
  const head = value.slice(0, Math.min(visible, value.length));
  return `${head}***`;
};

const fingerprint = (value: string): string => {
  if (!value) {
    return "(empty)";
  }
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
};

const comparePrefix = (actual: string, expected: string | undefined): boolean | null => {
  if (!expected) {
    return null;
  }
  return actual.startsWith(expected);
};

const parseApiError = (error: unknown): { message: string; status: number | null; detail: unknown } => {
  const status =
    typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: number }).code)
      : null;
  const detail =
    typeof error === "object" && error !== null && "data" in error
      ? (error as { data?: unknown }).data
      : null;

  return {
    message: error instanceof Error ? error.message : String(error),
    status,
    detail
  };
};

type ProbeStepResult = {
  step: string;
  ok: boolean;
  note: string;
  status: number | null;
  error: unknown;
};

const runProbe = async (client: TwitterApi): Promise<ProbeStepResult[]> => {
  const steps: ProbeStepResult[] = [];

  try {
    const user = await client.v1.verifyCredentials();
    steps.push({
      step: "v1.verifyCredentials",
      ok: true,
      note: `screen_name=${user.screen_name}`,
      status: null,
      error: null
    });
  } catch (error) {
    const parsed = parseApiError(error);
    steps.push({
      step: "v1.verifyCredentials",
      ok: false,
      note: "OAuth1.0a署名の基本疎通",
      status: parsed.status,
      error: parsed
    });
    return steps;
  }

  let meId = "";
  try {
    const me = await client.v2.me({
      "user.fields": ["username", "name", "verified", "created_at"]
    });
    meId = me.data.id;
    steps.push({
      step: "v2.me",
      ok: true,
      note: `username=${me.data.username}`,
      status: null,
      error: null
    });
  } catch (error) {
    const parsed = parseApiError(error);
    steps.push({
      step: "v2.me",
      ok: false,
      note: "v2 users/me 取得",
      status: parsed.status,
      error: parsed
    });
    return steps;
  }

  try {
    const timeline = await client.v2.userTimeline(meId, {
      max_results: 5,
      exclude: ["replies", "retweets"]
    });
    steps.push({
      step: "v2.userTimeline",
      ok: true,
      note: `tweet_count=${timeline.meta.result_count ?? 0}`,
      status: null,
      error: null
    });
  } catch (error) {
    const parsed = parseApiError(error);
    steps.push({
      step: "v2.userTimeline",
      ok: false,
      note: "v2 タイムライン取得",
      status: parsed.status,
      error: parsed
    });
  }

  return steps;
};

const main = async (): Promise<void> => {
  const accountSlug = getArgValue("--account-slug");
  if (!accountSlug) {
    throw new Error("account slug is required. use --account-slug <slug>");
  }

  const expectedApiKeyPrefix = getArgValue("--expect-api-key-prefix");
  const expectedAccessTokenPrefix = getArgValue("--expect-access-token-prefix");
  const probeMode = process.argv.includes("--probe");

  const account = await fetchAccount(accountSlug);
  const diagnostics = {
    slug: account.slug,
    enabled: account.enabled,
    apiKey: {
      length: account.x_api_key.length,
      prefix: maskPrefix(account.x_api_key),
      fingerprint: fingerprint(account.x_api_key),
      expectedPrefix: expectedApiKeyPrefix ?? null,
      expectedPrefixMatched: comparePrefix(account.x_api_key, expectedApiKeyPrefix)
    },
    apiKeySecret: {
      length: account.x_api_key_secret.length,
      prefix: maskPrefix(account.x_api_key_secret),
      fingerprint: fingerprint(account.x_api_key_secret)
    },
    accessToken: {
      length: account.x_access_token.length,
      prefix: maskPrefix(account.x_access_token),
      fingerprint: fingerprint(account.x_access_token),
      expectedPrefix: expectedAccessTokenPrefix ?? null,
      expectedPrefixMatched: comparePrefix(account.x_access_token, expectedAccessTokenPrefix)
    },
    accessTokenSecret: {
      length: account.x_access_token_secret.length,
      prefix: maskPrefix(account.x_access_token_secret),
      fingerprint: fingerprint(account.x_access_token_secret)
    }
  };

  const client = new TwitterApi({
    appKey: account.x_api_key,
    appSecret: account.x_api_key_secret,
    accessToken: account.x_access_token,
    accessSecret: account.x_access_token_secret
  });

  if (probeMode) {
    const steps = await runProbe(client);
    const firstFailed = steps.find((step) => !step.ok) ?? null;
    const allOk = steps.every((step) => step.ok);

    console.log(
      JSON.stringify(
        {
          ok: allOk,
          mode: "probe",
          accountSlug,
          diagnostics,
          firstFailedStep: firstFailed?.step ?? null,
          steps
        },
        null,
        2
      )
    );

    if (!allOk) {
      process.exit(1);
    }
    return;
  }

  try {
    const me = await client.v2.me({
      "user.fields": ["username", "name", "verified", "created_at"]
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          accountSlug,
          diagnostics,
          user: {
            id: me.data.id,
            username: me.data.username,
            name: me.data.name,
            verified: me.data.verified ?? false,
            created_at: me.data.created_at ?? null
          }
        },
        null,
        2
      )
    );
  } catch (error) {
    const parsed = parseApiError(error);

    console.error(
      JSON.stringify(
        {
          ok: false,
          accountSlug,
          diagnostics,
          error: {
            message: parsed.message,
            status: parsed.status,
            detail: parsed.detail
          }
        }
      )
    );
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
