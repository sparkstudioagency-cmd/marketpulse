begin;

-- Phase 1 weather-intelligence data foundation.
-- These tables are server-side only. No public read or write policies are
-- created in this phase.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

revoke all on function public.set_updated_at()
    from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

create table public.production_regions (
    id bigint generated always as identity primary key,
    code text not null,
    name text not null,
    province text not null,
    country text not null default 'South Africa',
    latitude numeric(9, 6) not null,
    longitude numeric(9, 6) not null,
    radius_km numeric(8, 2),
    timezone text not null default 'Africa/Johannesburg',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint production_regions_code_key unique (code),
    constraint production_regions_country_province_name_key
        unique (country, province, name),
    constraint production_regions_code_not_empty
        check (length(trim(code)) > 0),
    constraint production_regions_name_not_empty
        check (length(trim(name)) > 0),
    constraint production_regions_province_not_empty
        check (length(trim(province)) > 0),
    constraint production_regions_country_not_empty
        check (length(trim(country)) > 0),
    constraint production_regions_timezone_not_empty
        check (length(trim(timezone)) > 0),
    constraint production_regions_latitude_valid
        check (latitude between -90 and 90),
    constraint production_regions_longitude_valid
        check (longitude between -180 and 180),
    constraint production_regions_radius_valid
        check (radius_km is null or radius_km > 0)
);

create table public.product_production_regions (
    id bigint generated always as identity primary key,
    product_id bigint not null,
    production_region_id bigint not null,
    importance_weight numeric(5, 4),
    confidence numeric(5, 4),
    notes text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint product_production_regions_product_region_key
        unique (product_id, production_region_id),
    constraint product_production_regions_importance_weight_valid
        check (
            importance_weight is null
            or importance_weight between 0 and 1
        ),
    constraint product_production_regions_confidence_valid
        check (
            confidence is null
            or confidence between 0 and 1
        ),
    constraint product_production_regions_product_id_fkey
        foreign key (product_id)
        references public.products (id)
        on update cascade
        on delete restrict,
    constraint product_production_regions_region_id_fkey
        foreign key (production_region_id)
        references public.production_regions (id)
        on update cascade
        on delete restrict
);

create table public.weather_data_points (
    id bigint generated always as identity primary key,
    provider text not null,
    production_region_id bigint not null,
    data_kind text not null,
    provider_location_id text,
    provider_record_id text,
    valid_at timestamptz not null,
    forecast_issued_at timestamptz,
    temperature_c numeric(6, 2),
    minimum_temperature_c numeric(6, 2),
    maximum_temperature_c numeric(6, 2),
    precipitation_mm numeric(10, 3),
    precipitation_probability numeric(5, 2),
    humidity_percent numeric(5, 2),
    wind_speed_kph numeric(8, 2),
    condition_code text,
    condition_text text,
    raw_payload jsonb not null,
    collected_at timestamptz not null default now(),
    created_at timestamptz not null default now(),

    constraint weather_data_points_identity_key
        unique nulls not distinct (
            provider,
            production_region_id,
            data_kind,
            valid_at,
            forecast_issued_at
        ),
    constraint weather_data_points_provider_not_empty
        check (length(trim(provider)) > 0),
    constraint weather_data_points_data_kind_valid
        check (data_kind in ('observation', 'forecast')),
    constraint weather_data_points_forecast_issue_valid
        check (
            (data_kind = 'forecast' and forecast_issued_at is not null)
            or
            (data_kind = 'observation' and forecast_issued_at is null)
        ),
    constraint weather_data_points_temperature_range_valid
        check (
            minimum_temperature_c is null
            or maximum_temperature_c is null
            or minimum_temperature_c <= maximum_temperature_c
        ),
    constraint weather_data_points_precipitation_valid
        check (precipitation_mm is null or precipitation_mm >= 0),
    constraint weather_data_points_precipitation_probability_valid
        check (
            precipitation_probability is null
            or precipitation_probability between 0 and 100
        ),
    constraint weather_data_points_humidity_valid
        check (
            humidity_percent is null
            or humidity_percent between 0 and 100
        ),
    constraint weather_data_points_wind_speed_valid
        check (wind_speed_kph is null or wind_speed_kph >= 0),
    constraint weather_data_points_raw_payload_object
        check (jsonb_typeof(raw_payload) = 'object'),
    constraint weather_data_points_measurement_present
        check (
            temperature_c is not null
            or minimum_temperature_c is not null
            or maximum_temperature_c is not null
            or precipitation_mm is not null
            or precipitation_probability is not null
            or humidity_percent is not null
            or wind_speed_kph is not null
            or condition_code is not null
            or condition_text is not null
        ),
    constraint weather_data_points_region_id_fkey
        foreign key (production_region_id)
        references public.production_regions (id)
        on update cascade
        on delete restrict
);

create table public.weather_risk_rules (
    id bigint generated always as identity primary key,
    code text not null,
    name text not null,
    product_id bigint,
    production_region_id bigint,
    risk_type text not null,
    threshold_config jsonb not null,
    severity text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint weather_risk_rules_code_key unique (code),
    constraint weather_risk_rules_code_not_empty
        check (length(trim(code)) > 0),
    constraint weather_risk_rules_name_not_empty
        check (length(trim(name)) > 0),
    constraint weather_risk_rules_risk_type_valid
        check (
            risk_type in (
                'heat',
                'frost',
                'heavy_rain',
                'drought',
                'wind',
                'humidity'
            )
        ),
    constraint weather_risk_rules_severity_valid
        check (severity in ('low', 'medium', 'high', 'critical')),
    constraint weather_risk_rules_threshold_config_object
        check (jsonb_typeof(threshold_config) = 'object'),
    constraint weather_risk_rules_threshold_version_valid
        check (
            case
                when jsonb_typeof(threshold_config -> 'version') = 'number'
                    then (threshold_config ->> 'version')::numeric >= 1
                else false
            end
        ),
    constraint weather_risk_rules_product_id_fkey
        foreign key (product_id)
        references public.products (id)
        on update cascade
        on delete restrict,
    constraint weather_risk_rules_region_id_fkey
        foreign key (production_region_id)
        references public.production_regions (id)
        on update cascade
        on delete restrict
);

create table public.weather_alerts (
    id bigint generated always as identity primary key,
    production_region_id bigint not null,
    product_id bigint,
    weather_risk_rule_id bigint,
    risk_type text not null,
    severity text not null,
    evidence jsonb not null,
    trigger_values jsonb not null,
    forecast_window_start timestamptz not null,
    forecast_window_end timestamptz not null,
    status text not null,
    deduplication_key text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz,

    constraint weather_alerts_deduplication_key_key
        unique (deduplication_key),
    constraint weather_alerts_risk_type_valid
        check (
            risk_type in (
                'heat',
                'frost',
                'heavy_rain',
                'drought',
                'wind',
                'humidity'
            )
        ),
    constraint weather_alerts_severity_valid
        check (severity in ('low', 'medium', 'high', 'critical')),
    constraint weather_alerts_status_valid
        check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
    constraint weather_alerts_deduplication_key_not_empty
        check (length(trim(deduplication_key)) > 0),
    constraint weather_alerts_evidence_object
        check (jsonb_typeof(evidence) = 'object'),
    constraint weather_alerts_trigger_values_object
        check (jsonb_typeof(trigger_values) = 'object'),
    constraint weather_alerts_forecast_window_valid
        check (forecast_window_start < forecast_window_end),
    constraint weather_alerts_resolution_valid
        check (
            (
                status in ('resolved', 'dismissed')
                and resolved_at is not null
            )
            or
            (
                status in ('open', 'acknowledged')
                and resolved_at is null
            )
        ),
    constraint weather_alerts_region_id_fkey
        foreign key (production_region_id)
        references public.production_regions (id)
        on update cascade
        on delete restrict,
    constraint weather_alerts_product_id_fkey
        foreign key (product_id)
        references public.products (id)
        on update cascade
        on delete restrict,
    constraint weather_alerts_risk_rule_id_fkey
        foreign key (weather_risk_rule_id)
        references public.weather_risk_rules (id)
        on update cascade
        on delete restrict
);

create index idx_production_regions_active
    on public.production_regions (code)
    where is_active = true;

create index idx_product_production_regions_region_product
    on public.product_production_regions (
        production_region_id,
        product_id
    )
    where is_active = true;

create index idx_weather_data_points_region_kind_valid_at
    on public.weather_data_points (
        production_region_id,
        data_kind,
        valid_at desc
    );

create index idx_weather_data_points_latest_forecast_issue
    on public.weather_data_points (
        production_region_id,
        forecast_issued_at desc,
        valid_at
    )
    where data_kind = 'forecast';

create index idx_weather_data_points_provider_collected_at
    on public.weather_data_points (
        provider,
        collected_at desc
    );

create unique index weather_data_points_provider_record_key
    on public.weather_data_points (provider, provider_record_id)
    where provider_record_id is not null;

create index idx_weather_risk_rules_active_scope
    on public.weather_risk_rules (
        risk_type,
        product_id,
        production_region_id
    )
    where is_active = true;

create index idx_weather_alerts_status_severity_window
    on public.weather_alerts (
        status,
        severity,
        forecast_window_start
    );

create index idx_weather_alerts_region_product_history
    on public.weather_alerts (
        production_region_id,
        product_id,
        created_at desc
    );

create index idx_weather_alerts_risk_rule
    on public.weather_alerts (weather_risk_rule_id)
    where weather_risk_rule_id is not null;

create trigger production_regions_set_updated_at
before update on public.production_regions
for each row
execute function public.set_updated_at();

create trigger product_production_regions_set_updated_at
before update on public.product_production_regions
for each row
execute function public.set_updated_at();

create trigger weather_risk_rules_set_updated_at
before update on public.weather_risk_rules
for each row
execute function public.set_updated_at();

create trigger weather_alerts_set_updated_at
before update on public.weather_alerts
for each row
execute function public.set_updated_at();

alter table public.production_regions enable row level security;
alter table public.product_production_regions enable row level security;
alter table public.weather_data_points enable row level security;
alter table public.weather_risk_rules enable row level security;
alter table public.weather_alerts enable row level security;

revoke all on table public.production_regions
    from anon, authenticated;
revoke all on table public.product_production_regions
    from anon, authenticated;
revoke all on table public.weather_data_points
    from anon, authenticated;
revoke all on table public.weather_risk_rules
    from anon, authenticated;
revoke all on table public.weather_alerts
    from anon, authenticated;

grant all on table public.production_regions to service_role;
grant all on table public.product_production_regions to service_role;
grant all on table public.weather_data_points to service_role;
grant all on table public.weather_risk_rules to service_role;
grant all on table public.weather_alerts to service_role;

revoke all on sequence public.production_regions_id_seq
    from anon, authenticated;
revoke all on sequence public.product_production_regions_id_seq
    from anon, authenticated;
revoke all on sequence public.weather_data_points_id_seq
    from anon, authenticated;
revoke all on sequence public.weather_risk_rules_id_seq
    from anon, authenticated;
revoke all on sequence public.weather_alerts_id_seq
    from anon, authenticated;

grant all on sequence public.production_regions_id_seq to service_role;
grant all on sequence public.product_production_regions_id_seq to service_role;
grant all on sequence public.weather_data_points_id_seq to service_role;
grant all on sequence public.weather_risk_rules_id_seq to service_role;
grant all on sequence public.weather_alerts_id_seq to service_role;

comment on table public.production_regions is
    'Server-side weather intelligence data; no client access in Phase 1.';
comment on table public.product_production_regions is
    'Server-side weather intelligence data; no client access in Phase 1.';
comment on table public.weather_data_points is
    'Server-side weather intelligence data; no client access in Phase 1.';
comment on table public.weather_risk_rules is
    'Server-side weather intelligence data; no client access in Phase 1.';
comment on table public.weather_alerts is
    'Server-side weather intelligence data; no client access in Phase 1.';

commit;
