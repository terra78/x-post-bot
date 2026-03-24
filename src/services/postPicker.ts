import { supabase } from "../lib/supabase";
import { PostContent, XAccount } from "../types";

const randomItem = <T>(items: T[]): T => {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
};

const fetchActivePosts = async (accountId: string): Promise<PostContent[]> => {
  const { data, error } = await supabase
    .from("post_contents")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`failed to fetch posts: ${error.message}`);
  }

  return data as PostContent[];
};

const fetchUsedPostIds = async (accountId: string, cycleNo: number): Promise<Set<number>> => {
  const { data, error } = await supabase
    .from("x_account_post_history")
    .select("post_content_id")
    .eq("account_id", accountId)
    .eq("cycle_no", cycleNo);

  if (error) {
    throw new Error(`failed to fetch account post history: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => Number(row.post_content_id)));
};

const bumpCycle = async (account: XAccount): Promise<number> => {
  const nextCycle = account.current_cycle + 1;
  const { error } = await supabase
    .from("x_accounts")
    .update({ current_cycle: nextCycle })
    .eq("id", account.id);

  if (error) {
    throw new Error(`failed to update account cycle: ${error.message}`);
  }

  return nextCycle;
};

export const pickPostForAccount = async (
  account: XAccount
): Promise<{ post: PostContent; cycleNo: number }> => {
  const activePosts = await fetchActivePosts(account.id);
  if (activePosts.length === 0) {
    throw new Error("active post is not found");
  }

  const usedInCurrentCycle = await fetchUsedPostIds(account.id, account.current_cycle);
  const remaining = activePosts.filter((post) => !usedInCurrentCycle.has(post.id));

  if (remaining.length > 0) {
    return { post: randomItem(remaining), cycleNo: account.current_cycle };
  }

  const nextCycle = await bumpCycle(account);
  return { post: randomItem(activePosts), cycleNo: nextCycle };
};
