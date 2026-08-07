begin;

-- The coordinate is the representative midpoint for the Brits-Hartbeespoort
-- agricultural sourcing region and does not represent a specific farm.
insert into public.production_regions (
    code,
    name,
    province,
    country,
    latitude,
    longitude,
    radius_km,
    timezone,
    is_active
)
values (
    'ZA-NW-BRITS-HARTIES',
    'Brits-Hartbeespoort Production Region',
    'North West',
    'South Africa',
    -25.678200,
    27.829100,
    35.00,
    'Africa/Johannesburg',
    true
)
on conflict (code) do update
set
    name = excluded.name,
    province = excluded.province,
    country = excluded.country,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    radius_km = excluded.radius_km,
    timezone = excluded.timezone,
    is_active = excluded.is_active;

commit;
