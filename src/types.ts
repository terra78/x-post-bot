export interface PostContent {
  id: number;
  account_id: string;
  content: string;
  link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface XAccount {
  id: string;
  slug: string;
  display_name: string;
  posting_hour_utc: number;
  posting_minute_utc: number;
  enabled: boolean;
  current_cycle: number;
  x_api_key: string;
  x_api_key_secret: string;
  x_access_token: string;
  x_access_token_secret: string;
  created_at: string;
  updated_at: string;
}
