import "../config";
import { supabase } from "../lib/supabase";

const main = async (): Promise<void> => {
  const { error } = await supabase.from("x_accounts").upsert(
    [
      {
        slug: "account-1",
        display_name: "Account 1",
        posting_hour_utc: 0,
        posting_minute_utc: 0,
        enabled: true,
        x_api_key: "replace-me",
        x_api_key_secret: "replace-me",
        x_access_token: "replace-me",
        x_access_token_secret: "replace-me"
      },
      {
        slug: "account-2",
        display_name: "Account 2",
        posting_hour_utc: 12,
        posting_minute_utc: 0,
        enabled: true,
        x_api_key: "replace-me",
        x_api_key_secret: "replace-me",
        x_access_token: "replace-me",
        x_access_token_secret: "replace-me"
      }
    ],
    { onConflict: "slug" }
  );

  if (error) {
    throw new Error(error.message);
  }

  console.log("seed completed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
