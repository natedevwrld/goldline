create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency text not null default 'USDT' check (currency = 'USDT'),
  balance numeric(20, 8) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric(20, 8) not null check (amount > 0),
  currency text not null default 'USDT' check (currency = 'USDT'),
  status text not null default 'pending' check (status in ('pending', 'processed', 'rejected')),
  reference text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles (id)
);

create index transactions_status_created_idx on public.transactions (status, created_at desc);
create index transactions_user_created_idx on public.transactions (user_id, created_at desc);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text not null,
  transaction_id uuid references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.notification_templates (
  id text primary key,
  category text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

insert into public.notification_templates (id, category, title, body) values
  ('welcome', 'account', 'Welcome to Goldline', 'Your account is ready. Explore markets and configure your alerts.'),
  ('sign_in', 'security', 'New sign-in', 'A new sign-in to your Goldline account was detected.'),
  ('deposit_pending', 'transactions', 'Deposit under review', 'Your USDT deposit request is awaiting review.'),
  ('deposit_processed', 'transactions', 'Deposit processed', 'Your USDT deposit has been processed.'),
  ('withdrawal_pending', 'transactions', 'Withdrawal under review', 'Your USDT withdrawal request is awaiting review.'),
  ('withdrawal_processed', 'transactions', 'Withdrawal processed', 'Your USDT withdrawal request has been processed.'),
  ('withdrawal_rejected', 'transactions', 'Withdrawal not processed', 'Your withdrawal request was not processed. Contact support for details.'),
  ('market_alert', 'markets', 'Market alert', 'A market you follow has reached your alert level.'),
  ('strategy_paused', 'strategies', 'Strategy paused', 'Your demo strategy has stopped. Review its latest activity.'),
  ('security_update', 'security', 'Security settings updated', 'Your account security settings were changed.')
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.create_user_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_user_records();

create or replace function public.notify_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_notifications (category, title, body, transaction_id)
    values (
      'transactions',
      'Pending ' || new.kind,
      'A ' || new.kind || ' request for ' || new.amount || ' USDT is awaiting review.',
      new.id
    );
  elsif old.status = 'pending' and new.status in ('processed', 'rejected') then
    insert into public.admin_notifications (category, title, body, transaction_id)
    values (
      'transactions',
      'Transaction ' || new.status,
      'A ' || new.kind || ' request for ' || new.amount || ' USDT was ' || new.status || '.',
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger transaction_admin_notifications
  after insert or update of status on public.transactions
  for each row execute function public.notify_transaction_change();

create or replace function public.process_transaction(p_transaction_id uuid, p_approve boolean)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.transactions;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into target
  from public.transactions
  where id = p_transaction_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending transaction not found' using errcode = 'P0002';
  end if;

  if p_approve then
    if target.kind = 'withdrawal' then
      update public.wallets
      set balance = balance - target.amount, updated_at = now()
      where user_id = target.user_id and balance >= target.amount;
      if not found then
        raise exception 'Insufficient USDT wallet balance' using errcode = '23514';
      end if;
    else
      update public.wallets
      set balance = balance + target.amount, updated_at = now()
      where user_id = target.user_id;
    end if;
    update public.transactions
    set status = 'processed', processed_at = now(), processed_by = (select auth.uid())
    where id = p_transaction_id
    returning * into target;
  else
    update public.transactions
    set status = 'rejected', processed_at = now(), processed_by = (select auth.uid())
    where id = p_transaction_id
    returning * into target;
  end if;

  return target;
end;
$$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.notification_templates enable row level security;

create policy "Users and admins can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Users can read their wallet"
  on public.wallets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Users can read their transactions"
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Users can request transactions"
  on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and processed_at is null and processed_by is null);

create policy "Admins can read notifications"
  on public.admin_notifications for select to authenticated
  using ((select public.is_admin()));

create policy "Authenticated users can read notification templates"
  on public.notification_templates for select to authenticated
  using (true);

revoke all on public.profiles, public.wallets, public.transactions, public.admin_notifications, public.notification_templates from anon;
grant select on public.profiles, public.wallets, public.transactions, public.admin_notifications, public.notification_templates to authenticated;
grant insert on public.transactions to authenticated;
grant execute on function public.process_transaction(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.transactions;
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;