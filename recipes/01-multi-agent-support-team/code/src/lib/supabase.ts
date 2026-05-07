import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_POWABASE_URL;
const anonKey = import.meta.env.VITE_POWABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_POWABASE_URL or VITE_POWABASE_ANON_KEY — copy .env.example to .env.local and fill in values from Studio → Project Connect → API.",
  );
}

export const supabase = createClient(url, anonKey);
