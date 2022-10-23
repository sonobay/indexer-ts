import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const createDB = async () => {
  if (!supabaseUrl) {
    throw new Error("process.env.SUPABASE_URL not set");
  }

  if (!supabaseKey) {
    throw new Error("process.env.SUPABASE_KEY not set");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  return supabase;
};
