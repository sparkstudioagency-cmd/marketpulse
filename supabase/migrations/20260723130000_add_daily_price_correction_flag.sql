-- Preserve whether a daily market-price record represents
-- a correction or reversal reported by the source market.
--
-- Existing rows are normal historical records unless explicitly
-- identified otherwise, so they default to false.

alter table public.daily_prices
add column if not exists is_correction boolean not null default false;