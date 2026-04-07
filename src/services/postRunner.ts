import { supabase } from "../lib/supabase";
import { PostContent, XAccount } from "../types";
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

type QueueTarget = {
  queueId: number | null;
  post: PostContent;
  cycleNo: number;
};

const deleteQueueRow = async (queueId: number): Promise<void> => {
  const { error } = await supabase.from("priority_post_queue").delete().eq("id", queueId);
  if (error) {
    throw new Error(`failed to delete queue row: ${error.message}`);
  }
};

const findPriorityQueueTarget = async (account: XAccount): Promise<QueueTarget | null> => {
  while (true) {
    const { data: queueRow, error: queueError } = await supabase
      .from("priority_post_queue")
      .select("id, post_content_id")
      .eq("account_id", account.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queueError) {
      throw new Error(`failed to fetch priority queue: ${queueError.message}`);
    }

    if (!queueRow) {
      return null;
    }

    const queueId = Number(queueRow.id);
    const postContentId = Number(queueRow.post_content_id);
    const { data: post, error: postError } = await supabase
      .from("post_contents")
      .select("*")
      .eq("id", postContentId)
      .eq("account_id", account.id)
      .maybeSingle();

    if (postError) {
      throw new Error(`failed to fetch queued post content: ${postError.message}`);
    }

    if (post) {
      return {
        queueId,
        post: post as PostContent,
        cycleNo: account.current_cycle
      };
    }

    // キューが壊れている場合は詰まり防止のため破棄して次を確認
    await deleteQueueRow(queueId);
  }
};

export const runPostingForAccount = async (account: XAccount): Promise<void> => {
  const queued = await findPriorityQueueTarget(account);
  const { post, cycleNo, queueId } = queued ?? { ...(await pickPostForAccount(account)), queueId: null };
  const shortLink = await shortenUrlIfNeeded(post.link);
  const text = buildPostText(post.content, shortLink);

  try {
    const xPostId = await postWithRetry(account, text);
    await saveHistory(account.id, post.id, cycleNo);
    if (queueId !== null) {
      await deleteQueueRow(queueId);
    }
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
