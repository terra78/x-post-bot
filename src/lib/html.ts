export const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
};

export const layout = (title: string, body: string): string => {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f7f7f9; color: #1f2937; }
      .container { max-width: 980px; margin: 32px auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
      h1, h2 { margin-top: 0; }
      a { color: #2563eb; text-decoration: none; }
      .nav { display: flex; gap: 12px; margin-bottom: 16px; }
      .nav a { background: #eff6ff; padding: 8px 12px; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 10px 8px; vertical-align: top; }
      .card { margin: 16px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; }
      input, textarea, button, select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; margin: 6px 0 10px; font: inherit; }
      button { background: #2563eb; color: #fff; cursor: pointer; }
      button.danger { background: #dc2626; }
      .inline { display: inline-block; width: auto; margin-right: 8px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .message { background: #ecfeff; border: 1px solid #67e8f9; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; }
      .error { background: #fef2f2; border: 1px solid #fca5a5; }
    </style>
  </head>
  <body>
    <div class="container">${body}</div>
  </body>
</html>`;
};
