import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_POWABASE_URL,
  import.meta.env.VITE_POWABASE_ANON_KEY,
);
