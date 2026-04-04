import cookieParser from "cookie-parser";
import express, { Request, Response } from "express";
import { config } from "./config";
import { authCookieName, isAuthenticated, isValidCredential, issueSessionToken } from "./lib/auth";
import { escapeHtml, layout } from "./lib/html";
import { supabase } from "./lib/supabase";
import { PostContent, XAccount } from "./types";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(config.cookieSecret));

const getFlashMessage = (req: Request): { type: "message" | "error"; text: string } | null => {
  const message = req.query.message;
  const error = req.query.error;
  if (typeof message === "string") {
    return { type: "message", text: message };
  }
  if (typeof error === "string") {
    return { type: "error", text: error };
  }
  return null;
};

const renderFlash = (req: Request): string => {
  const flash = getFlashMessage(req);
  if (!flash) {
    return "";
  }
  const className = flash.type === "error" ? "message error" : "message";
  return `<div class="${className}">${escapeHtml(flash.text)}</div>`;
};

const requireAuth = (req: Request, res: Response): boolean => {
  if (!isAuthenticated(req.cookies[authCookieName])) {
    res.redirect("/login");
    return false;
  }
  return true;
};

const weightedLength = (text: string): number => {
  let total = 0;
  for (const ch of text) {
    // ASCII and half-width Katakana are treated as half-width (=1)
    const code = ch.codePointAt(0) ?? 0;
    const isAscii = code <= 0x007f;
    const isHalfWidthKatakana = code >= 0xff61 && code <= 0xff9f;
    total += isAscii || isHalfWidthKatakana ? 1 : 2;
  }
  return total;
};

const buildPostPayload = (content: string, link: string): string => {
  return link ? `${content} ${link}` : content;
};

const postsRedirect = (accountId: string | null, params: Record<string, string>): string => {
  const search = new URLSearchParams(params);
  if (accountId) {
    search.set("account_id", accountId);
  }
  return `/admin/posts?${search.toString()}`;
};

const loadAccounts = async (): Promise<XAccount[]> => {
  const { data, error } = await supabase.from("x_accounts").select("*").order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as XAccount[];
};

const nav = `
<div class="nav">
  <a href="/admin/posts">投稿管理</a>
  <a href="/admin/accounts">アカウント管理</a>
  <a href="/logout">ログアウト</a>
</div>`;

app.get("/", (_req, res) => {
  res.redirect("/admin/posts");
});

app.get("/login", (req, res) => {
  if (isAuthenticated(req.cookies[authCookieName])) {
    res.redirect("/admin/posts");
    return;
  }

  const body = `
    <h1>ログイン</h1>
    ${renderFlash(req)}
    <form method="post" action="/login">
      <label>ID</label>
      <input name="username" autocomplete="username" />
      <label>パスワード</label>
      <input type="password" name="password" autocomplete="current-password" />
      <button type="submit">ログイン</button>
    </form>`;
  res.send(layout("ログイン", body));
});

app.post("/login", (req, res) => {
  const username = String(req.body.username ?? "");
  const password = String(req.body.password ?? "");
  if (!isValidCredential(username, password)) {
    res.redirect("/login?error=IDまたはパスワードが違います");
    return;
  }

  res.cookie(authCookieName, issueSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    signed: false
  });
  res.redirect("/admin/posts?message=ログインしました");
});

app.get("/logout", (_req, res) => {
  res.clearCookie(authCookieName);
  res.redirect("/login?message=ログアウトしました");
});

app.get("/admin/posts", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const pageSize = 30;
  const pageText = typeof req.query.page === "string" ? req.query.page : "1";
  const parsedPage = Number(pageText);
  const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const accountIdFromQuery = typeof req.query.account_id === "string" ? req.query.account_id : "";
  const accounts = await loadAccounts();
  const selectedAccount = accounts.find((account) => account.id === accountIdFromQuery) ?? accounts[0] ?? null;

  let posts: PostContent[] = [];
  let totalCount = 0;
  if (selectedAccount) {
    const { data, error } = await supabase
      .from("post_contents")
      .select("*")
      .eq("account_id", selectedAccount.id)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      res.status(500).send(layout("エラー", `<h1>読み込み失敗</h1><p>${escapeHtml(error.message)}</p>`));
      return;
    }
    posts = (data ?? []) as PostContent[];
  }

  if (selectedAccount) {
    const { count, error } = await supabase
      .from("post_contents")
      .select("*", { count: "exact", head: true })
      .eq("account_id", selectedAccount.id);
    if (!error) {
      totalCount = count ?? totalCount;
    }
  }

  const accountSelectOptions = accounts
    .map((account) => {
      const selected = selectedAccount?.id === account.id ? "selected" : "";
      return `<option value="${escapeHtml(account.id)}" ${selected}>${escapeHtml(account.display_name)} (${escapeHtml(account.slug)})</option>`;
    })
    .join("");

  const rows = posts
    .map((post) => {
      return `<tr>
        <td>${post.id}</td>
        <td>${escapeHtml(post.content)}</td>
        <td>${post.link ? `<a href="${escapeHtml(post.link)}" target="_blank" rel="noreferrer">${escapeHtml(post.link)}</a>` : "-"}</td>
        <td>${post.is_active ? "有効" : "無効"}</td>
        <td>
          <form method="post" action="/admin/posts/${post.id}/update">
            <input type="hidden" name="account_id" value="${escapeHtml(post.account_id)}" />
            <textarea name="content" rows="2" required>${escapeHtml(post.content)}</textarea>
            <input name="link" value="${escapeHtml(post.link ?? "")}" placeholder="https://example.com" />
            <label><input class="inline" type="checkbox" name="is_active" ${post.is_active ? "checked" : ""} />有効</label>
            <button class="inline" type="submit">更新</button>
          </form>
          <form method="post" action="/admin/posts/${post.id}/delete" onsubmit="return confirm('削除しますか？')">
            <input type="hidden" name="account_id" value="${escapeHtml(post.account_id)}" />
            <button class="danger inline" type="submit">削除</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const hasPrev = currentPage > 1;
  const hasNext = selectedAccount ? currentPage * pageSize < totalCount : false;
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = currentPage + 1;
  const pager = selectedAccount
    ? `<div class="card">
        <strong>件数:</strong> ${totalCount}件 / <strong>ページ:</strong> ${currentPage}
        <div style="margin-top:8px;">
          ${
            hasPrev
              ? `<a class="inline" href="/admin/posts?account_id=${escapeHtml(selectedAccount.id)}&page=${prevPage}">前へ</a>`
              : ""
          }
          ${
            hasNext
              ? `<a class="inline" href="/admin/posts?account_id=${escapeHtml(selectedAccount.id)}&page=${nextPage}">次へ</a>`
              : ""
          }
        </div>
      </div>`
    : "";

  const body = `
    <h1>投稿管理</h1>
    ${nav}
    ${renderFlash(req)}
    ${pager}
    <div class="card">
      <h2>対象アカウント</h2>
      <form method="get" action="/admin/posts">
        <label>アカウント</label>
        <select name="account_id" ${accounts.length === 0 ? "disabled" : ""}>
          ${accountSelectOptions}
        </select>
        <button type="submit">切り替え</button>
      </form>
      ${accounts.length === 0 ? "<p>先にアカウントを作成してください。</p>" : ""}
    </div>
    <div class="card">
      <h2>新規追加</h2>
      <form method="post" action="/admin/posts">
        <label>保存先アカウント</label>
        <select name="account_id" ${accounts.length === 0 ? "disabled" : ""} required>
          ${accountSelectOptions}
        </select>
        <label>ポスト内容</label>
        <textarea name="content" rows="3" required></textarea>
        <label>リンク（任意）</label>
        <input name="link" placeholder="https://example.com" />
        <label><input class="inline" type="checkbox" name="is_active" checked />有効</label>
        <button type="submit" ${selectedAccount ? "" : "disabled"}>追加</button>
      </form>
    </div>
    <table>
      <thead>
        <tr><th>ID</th><th>内容</th><th>リンク</th><th>状態</th><th>操作</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  res.send(layout("投稿管理", body));
});

app.post("/admin/posts", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const accountId = String(req.body.account_id ?? "").trim();
  const content = String(req.body.content ?? "").trim();
  const link = String(req.body.link ?? "").trim();
  const isActive = req.body.is_active === "on";

  if (!accountId || !content) {
    res.redirect(postsRedirect(accountId || null, { error: "アカウントとポスト内容は必須です" }));
    return;
  }

  const payloadLength = weightedLength(buildPostPayload(content, link));
  if (payloadLength > 280) {
    res.redirect(postsRedirect(accountId, { error: "ポスト内容+リンクは全角140文字（半角280文字）以内で入力してください" }));
    return;
  }

  const { error } = await supabase.from("post_contents").insert({
    account_id: accountId,
    content,
    link: link || null,
    is_active: isActive
  });

  if (error) {
    res.redirect(postsRedirect(accountId, { error: error.message }));
    return;
  }

  res.redirect(postsRedirect(accountId, { message: "追加しました" }));
});

app.post("/admin/posts/:id/update", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const id = Number(req.params.id);
  const accountId = String(req.body.account_id ?? "").trim();
  const content = String(req.body.content ?? "").trim();
  const link = String(req.body.link ?? "").trim();
  const isActive = req.body.is_active === "on";

  if (!accountId || !content || Number.isNaN(id)) {
    res.redirect(postsRedirect(accountId || null, { error: "更新パラメータが不正です" }));
    return;
  }

  const payloadLength = weightedLength(buildPostPayload(content, link));
  if (payloadLength > 280) {
    res.redirect(postsRedirect(accountId, { error: "ポスト内容+リンクは全角140文字（半角280文字）以内で入力してください" }));
    return;
  }

  const { error } = await supabase
    .from("post_contents")
    .update({ content, link: link || null, is_active: isActive })
    .eq("id", id)
    .eq("account_id", accountId);

  if (error) {
    res.redirect(postsRedirect(accountId, { error: error.message }));
    return;
  }

  res.redirect(postsRedirect(accountId, { message: "更新しました" }));
});

app.post("/admin/posts/:id/delete", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const id = Number(req.params.id);
  const accountId = String(req.body.account_id ?? "").trim();
  if (!accountId || Number.isNaN(id)) {
    res.redirect(postsRedirect(accountId || null, { error: "IDが不正です" }));
    return;
  }

  const { error } = await supabase.from("post_contents").delete().eq("id", id).eq("account_id", accountId);
  if (error) {
    res.redirect(postsRedirect(accountId, { error: error.message }));
    return;
  }

  res.redirect(postsRedirect(accountId, { message: "削除しました" }));
});

app.get("/admin/accounts", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const data = await loadAccounts();

  const rows = data
    .map((account) => {
      return `<tr>
        <td>${escapeHtml(account.slug)}</td>
        <td>${escapeHtml(account.display_name)}</td>
        <td>${account.enabled ? "有効" : "無効"}</td>
        <td>
          <form method="post" action="/admin/accounts/${account.id}/update">
            <div class="row">
              <div>
                <label>Slug</label>
                <input name="slug" value="${escapeHtml(account.slug)}" required />
              </div>
              <div>
                <label>表示名</label>
                <input name="display_name" value="${escapeHtml(account.display_name)}" required />
              </div>
            </div>
            <label><input class="inline" type="checkbox" name="enabled" ${account.enabled ? "checked" : ""} />有効</label>
            <div class="row">
              <div>
                <label>X API Key（変更時のみ入力）</label>
                <input type="password" name="x_api_key" />
              </div>
              <div>
                <label>X API Secret（変更時のみ入力）</label>
                <input type="password" name="x_api_key_secret" />
              </div>
            </div>
            <div class="row">
              <div>
                <label>Access Token（変更時のみ入力）</label>
                <input type="password" name="x_access_token" />
              </div>
              <div>
                <label>Access Token Secret（変更時のみ入力）</label>
                <input type="password" name="x_access_token_secret" />
              </div>
            </div>
            <button class="inline" type="submit">更新</button>
          </form>
          <form method="post" action="/admin/accounts/${account.id}/delete" onsubmit="return confirm('削除しますか？')">
            <button class="danger inline" type="submit">削除</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1>アカウント管理</h1>
    ${nav}
    ${renderFlash(req)}
    <div class="card">
      <h2>新規追加</h2>
      <form method="post" action="/admin/accounts">
        <div class="row">
          <div>
            <label>Slug（英数字・ハイフン推奨）</label>
            <input name="slug" required />
          </div>
          <div>
            <label>表示名</label>
            <input name="display_name" required />
          </div>
        </div>
        <label><input class="inline" type="checkbox" name="enabled" checked />有効</label>
        <div class="row">
          <div>
            <label>X API Key</label>
            <input type="password" name="x_api_key" required />
          </div>
          <div>
            <label>X API Secret</label>
            <input type="password" name="x_api_key_secret" required />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Access Token</label>
            <input type="password" name="x_access_token" required />
          </div>
          <div>
            <label>Access Token Secret</label>
            <input type="password" name="x_access_token_secret" required />
          </div>
        </div>
        <button type="submit">追加</button>
      </form>
    </div>
    <table>
      <thead>
        <tr><th>Slug</th><th>表示名</th><th>状態</th><th>操作</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  res.send(layout("アカウント管理", body));
});

app.post("/admin/accounts", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const payload = {
    slug: String(req.body.slug ?? "").trim(),
    display_name: String(req.body.display_name ?? "").trim(),
    posting_hour_utc: 0,
    posting_minute_utc: 0,
    enabled: req.body.enabled === "on",
    x_api_key: String(req.body.x_api_key ?? "").trim(),
    x_api_key_secret: String(req.body.x_api_key_secret ?? "").trim(),
    x_access_token: String(req.body.x_access_token ?? "").trim(),
    x_access_token_secret: String(req.body.x_access_token_secret ?? "").trim()
  };

  if (
    !payload.slug ||
    !payload.display_name ||
    !payload.x_api_key ||
    !payload.x_api_key_secret ||
    !payload.x_access_token ||
    !payload.x_access_token_secret
  ) {
    res.redirect("/admin/accounts?error=必須項目を入力してください");
    return;
  }

  const { error } = await supabase.from("x_accounts").insert(payload);
  if (error) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
    return;
  }

  res.redirect("/admin/accounts?message=追加しました");
});

app.post("/admin/accounts/:id/update", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const id = String(req.params.id);
  const accountUpdate: Record<string, unknown> = {
    slug: String(req.body.slug ?? "").trim(),
    display_name: String(req.body.display_name ?? "").trim(),
    enabled: req.body.enabled === "on"
  };

  const secretFields = [
    "x_api_key",
    "x_api_key_secret",
    "x_access_token",
    "x_access_token_secret"
  ] as const;

  for (const key of secretFields) {
    const value = String(req.body[key] ?? "").trim();
    if (value) {
      accountUpdate[key] = value;
    }
  }

  const { error } = await supabase.from("x_accounts").update(accountUpdate).eq("id", id);
  if (error) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
    return;
  }

  res.redirect("/admin/accounts?message=更新しました");
});

app.post("/admin/accounts/:id/delete", async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const id = String(req.params.id);
  const { error } = await supabase.from("x_accounts").delete().eq("id", id);
  if (error) {
    res.redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
    return;
  }

  res.redirect("/admin/accounts?message=削除しました");
});

app.listen(config.port, () => {
  console.log(`admin app listening on :${config.port}`);
});
