import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  const { data, error } = await supabase.from("components").select("id,name").limit(3);
  if (error) {
    console.error("SELECT failed:", error);
    process.exit(1);
  }
  console.log("SELECT ok. Rows:", data?.length ?? 0);
  console.log(data);
})();
