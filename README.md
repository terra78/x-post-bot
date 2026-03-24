# x-post-bot

2つのXアカウントに対して、投稿候補をSupabaseからランダム取得して投稿するボットです。  
管理画面で投稿候補（内容・リンク）とアカウント設定をCRUDできます。

## できること

- 1日1回投稿（アカウントごとに時刻を別管理）
- 投稿候補は `post_contents` からランダム取得（アカウント単位）
- 同一アカウントでは「1巡するまで重複投稿しない」
- リンクがある場合は `is.gd` で短縮（失敗時は元URLを使用）
- 投稿失敗時は3回までリトライ（指数バックオフ）
- 管理画面ログイン（初期: `admin / beckham7`）

## セットアップ

1. 依存インストール

```bash
npm install
```

2. `.env` 作成

```bash
cp .env.example .env
```

3. Supabaseで `supabase/schema.sql` を実行
   - 既存環境を更新する場合は `supabase/migrations/20260324_account_scoped_post_contents.sql` も実行
4. `.env` に以下を設定
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - 必要なら `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `COOKIE_SECRET`

## 起動

```bash
npm run dev
```

- 管理画面: `http://localhost:3000`
- ログイン初期値: `admin / beckham7`

## 投稿ジョブ

### 単一アカウント指定で実行

```bash
npm run post -- --account-slug your-account-slug
```

### 時刻一致アカウントを実行

```bash
npm run post
```

`x_accounts.posting_hour_utc` + `posting_minute_utc` が現在UTCと一致する有効アカウントが対象です。

## 既存タイムライン取り込み

既存のX投稿を `post_contents` に取り込みできます（重複はスキップ）。

```bash
npm run import:timeline -- --account-slug shena_ringo --limit 10
```

- `--account-slug`: `x_accounts.slug`（必須）
- `--limit`: 取得件数（任意、デフォルト 10 / 最大 100）
- `--username`: Xのユーザー名をslugと分けたい時のみ指定（任意）

取り込み時は返信・リツイートを除外し、本文中の `t.co` URLは除去して、最初のURLを `link` として保存します。

## X認証チェック（users/me）

投稿せずに認証だけ確認したい場合:

```bash
npm run check:x-auth -- --account-slug shena_ringo
```

成功すると、認証された `id` / `username` がJSONで表示されます。
照合付きで確認する場合:

```bash
npm run check:x-auth -- --account-slug shena_ringo --expect-api-key-prefix abc123 --expect-access-token-prefix 123456
```

`--expect-*` は任意で、DBに保存されているキー先頭文字列との一致可否を安全に確認できます。

段階診断モード（失敗地点の特定）:

```bash
npm run check:x-auth -- --account-slug shena_ringo --probe
```

`--probe` は以下を順番に叩き、最初に失敗したステップを返します。
- `v1.verifyCredentials`
- `v2.me`
- `v2.userTimeline`

## GitHub Actions

`.github/workflows/post.yml` を用意済みです。  
外部cronサービスから `workflow_dispatch` を叩く想定で、`account_slug` を渡せます。

必要なGitHub Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## テーブル概要

- `post_contents`: 投稿候補（内容・リンク）
- `post_contents.account_id`: どのアカウント向け候補かを保持
- `x_accounts`: アカウント情報、投稿時刻、X API資格情報
- `x_account_post_history`: 各アカウントがどの投稿候補を使ったか（重複防止）
- `x_post_logs`: 投稿実行ログ（成功/失敗）
- `short_links`: 短縮URLキャッシュ

## X APIについて

X APIはプラン変更の影響を受けるため、投稿可否・上限は最新仕様を確認してください。  
Freeプランで投稿不可の場合は、Basic以上への変更が必要になる可能性があります。
