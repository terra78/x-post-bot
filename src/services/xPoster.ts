import { TwitterApi } from "twitter-api-v2";
import { XAccount } from "../types";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const postOnce = async (account: XAccount, text: string): Promise<string> => {
  const client = new TwitterApi({
    appKey: account.x_api_key,
    appSecret: account.x_api_key_secret,
    accessToken: account.x_access_token,
    accessSecret: account.x_access_token_secret
  });

  const result = await client.v2.tweet(text);
  return result.data.id;
};

export const postWithRetry = async (account: XAccount, text: string): Promise<string> => {
  const maxAttempts = 4; // 初回 + リトライ3回

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await postOnce(account, text);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = 500 * (2 ** (attempt - 1));
        await wait(delayMs);
      }
    }
  }

  throw lastError;
};
