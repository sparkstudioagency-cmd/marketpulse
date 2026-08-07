import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export interface SupabaseAdminCredentials {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
}

export type SupabaseEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type SupabaseAdminClientOptions =
  | { readonly credentials: SupabaseAdminCredentials }
  | { readonly environment: SupabaseEnvironment };

function requiredEnvironmentValue(
  environment: SupabaseEnvironment,
  name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY",
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value;
}

export function supabaseAdminCredentialsFromEnvironment(
  environment: SupabaseEnvironment,
): SupabaseAdminCredentials {
  return {
    supabaseUrl: requiredEnvironmentValue(environment, "SUPABASE_URL"),
    serviceRoleKey: requiredEnvironmentValue(
      environment,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

export function createSupabaseAdminClient(
  options: SupabaseAdminClientOptions,
): SupabaseClient {
  const credentials = "credentials" in options
    ? options.credentials
    : supabaseAdminCredentialsFromEnvironment(options.environment);

  if (!credentials.supabaseUrl) {
    throw new Error("SUPABASE_URL is required.");
  }
  if (!credentials.serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  return createClient(credentials.supabaseUrl, credentials.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
