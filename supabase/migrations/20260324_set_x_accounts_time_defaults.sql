-- cron主導運用向け: x_accounts の時刻カラムを既定値0へ
-- 新規レコード作成時に posting_* を入力しなくても保存できるようにする

alter table x_accounts
  alter column posting_hour_utc set default 0;

alter table x_accounts
  alter column posting_minute_utc set default 0;
