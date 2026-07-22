


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."containers" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."containers" OWNER TO "postgres";


ALTER TABLE "public"."containers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."containers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."daily_prices" (
    "id" bigint NOT NULL,
    "market_id" bigint NOT NULL,
    "market_product_id" bigint NOT NULL,
    "market_date" "date" NOT NULL,
    "low_price" numeric(10,2),
    "average_price" numeric(10,2),
    "high_price" numeric(10,2),
    "sold_quantity" integer,
    "opening_quantity" integer,
    "quantity_on_hand" integer,
    "total_mass" numeric(10,2),
    "total_sales" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_prices" OWNER TO "postgres";


ALTER TABLE "public"."daily_prices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."daily_prices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."grades" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grades" OWNER TO "postgres";


ALTER TABLE "public"."grades" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."grades_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ingestion_runs" (
    "id" bigint NOT NULL,
    "market_id" bigint NOT NULL,
    "scrape_date" "date" NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "status" "text" NOT NULL,
    "records_found" integer DEFAULT 0,
    "records_imported" integer DEFAULT 0,
    "records_updated" integer DEFAULT 0,
    "source_url" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scrape_runs_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'RUNNING'::"text", 'SUCCESS'::"text", 'FAILED'::"text", 'PARTIAL'::"text"])))
);


ALTER TABLE "public"."ingestion_runs" OWNER TO "postgres";


ALTER TABLE "public"."ingestion_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ingestion_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."market_products" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "container_id" bigint NOT NULL,
    "grade_id" bigint NOT NULL,
    "mass" numeric(10,2),
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."market_products" OWNER TO "postgres";


ALTER TABLE "public"."market_products" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."market_products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."markets" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "province" "text",
    "website" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."markets" OWNER TO "postgres";


ALTER TABLE "public"."markets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."markets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."products" OWNER TO "postgres";


ALTER TABLE "public"."products" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."containers"
    ADD CONSTRAINT "containers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."containers"
    ADD CONSTRAINT "containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_prices"
    ADD CONSTRAINT "daily_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_prices"
    ADD CONSTRAINT "daily_prices_unique" UNIQUE ("market_id", "market_product_id", "market_date");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingestion_runs"
    ADD CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_unique" UNIQUE ("product_id", "container_id", "grade_id", "mass", "unit");



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingestion_runs"
    ADD CONSTRAINT "scrape_runs_unique" UNIQUE ("market_id", "scrape_date");



ALTER TABLE ONLY "public"."daily_prices"
    ADD CONSTRAINT "daily_prices_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."daily_prices"
    ADD CONSTRAINT "daily_prices_market_product_id_fkey" FOREIGN KEY ("market_product_id") REFERENCES "public"."market_products"("id");



ALTER TABLE ONLY "public"."ingestion_runs"
    ADD CONSTRAINT "ingestion_runs_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id");



ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id");



ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."containers" TO "anon";
GRANT ALL ON TABLE "public"."containers" TO "authenticated";
GRANT ALL ON TABLE "public"."containers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."containers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."containers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."containers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_prices" TO "anon";
GRANT ALL ON TABLE "public"."daily_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_prices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_prices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_prices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_prices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."grades" TO "anon";
GRANT ALL ON TABLE "public"."grades" TO "authenticated";
GRANT ALL ON TABLE "public"."grades" TO "service_role";



GRANT ALL ON SEQUENCE "public"."grades_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."grades_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."grades_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ingestion_runs" TO "anon";
GRANT ALL ON TABLE "public"."ingestion_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ingestion_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ingestion_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ingestion_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ingestion_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."market_products" TO "anon";
GRANT ALL ON TABLE "public"."market_products" TO "authenticated";
GRANT ALL ON TABLE "public"."market_products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."market_products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."market_products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."market_products_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."markets" TO "anon";
GRANT ALL ON TABLE "public"."markets" TO "authenticated";
GRANT ALL ON TABLE "public"."markets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."markets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."markets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."markets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







