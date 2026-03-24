-- 既存環境向け: post_contents を account 単位に分離する移行
-- 前提:
--   - x_accounts が作成済み
--   - post_contents に account_id がまだ無い環境で実行
-- 注意:
--   - x_accounts が2件以上ある場合、既存post_contentsをどのaccountに寄せるか手動指定してください

alter table post_contents
add column if not exists account_id uuid;

do $$
declare
  account_count integer;
  default_account_id uuid;
begin
  select count(*) into account_count from x_accounts;

  if account_count = 0 then
    raise exception 'x_accounts is empty. create account first.';
  elsif account_count = 1 then
    select id into default_account_id from x_accounts limit 1;
    update post_contents
      set account_id = default_account_id
      where account_id is null;
  else
    raise exception 'multiple x_accounts found. run manual update for post_contents.account_id before applying NOT NULL.';
  end if;
end $$;

alter table post_contents
alter column account_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_contents_account_id_fkey'
  ) then
    alter table post_contents
      add constraint post_contents_account_id_fkey
      foreign key (account_id) references x_accounts(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_post_contents_account_content_link
  on post_contents(account_id, content, coalesce(link, ''));
