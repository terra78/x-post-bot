import { supabase } from "../lib/supabase";
import { XAccount } from "../types";
import { pickPostForAccount } from "./postPicker";
import { shortenUrlIfNeeded } from "./shortUrl";
import { postWithRetry } from "./xPoster";

const buildPostText = (content: string, shortLink: string | null): string => {
  return shortLink ? `${content} ${shortLink}` : content;
};

const saveHistory = async (accountId: string, postContentId: number, cycleNo: number): Promise<void> => {
  const { error } = await supabase.from("x_account_post_history").insert({
    account_id: accountId,
    post_content_id: postContentId,
    cycle_no: cycleNo
  });

  if (error) {
    throw new Error(`failed to insert post history: ${error.message}`);
  }
};

const saveLog = async (params: {
  accountId: string;
  postContentId: number | null;
  status: "success" | "failed";
  postedText: string | null;
  xPostId: string | null;
  errorMessage: string | null;
}): Promise<void> => {
  await supabase.from("x_post_logs").insert({
    account_id: params.accountId,
    post_content_id: params.postContentId,
    status: params.status,
    posted_text: params.postedText,
    x_post_id: params.xPostId,
    error_message: params.errorMessage
  });
};

export const runPostingForAccount = async (account: XAccount): Promise<void> => {
  const { post, cycleNo } = await pickPostForAccount(account);
  const shortLink = await shortenUrlIfNeeded(post.link);
  const text = buildPostText(post.content, shortLink);

  try {
    const xPostId = await postWithRetry(account, text);
    await saveHistory(account.id, post.id, cycleNo);
    await saveLog({
      accountId: account.id,
      postContentId: post.id,
      status: "success",
      postedText: text,
      xPostId,
      errorMessage: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveLog({
      accountId: account.id,
      postContentId: post.id,
      status: "failed",
      postedText: text,
      xPostId: null,
      errorMessage: message
    });
    throw error;
  }
};
