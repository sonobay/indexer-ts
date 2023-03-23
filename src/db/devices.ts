import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "..";
import { DeviceRow } from "../types/device.types";

interface Params {
  name: string;
  manufacturer: string;
}

export interface Devices {
  fetch(p: Params): Promise<DeviceRow | undefined>;
  create(p: Params): Promise<DeviceRow | undefined>;
}

export const devices = (supabase: SupabaseClient): Devices => {
  const create = async ({ name, manufacturer }: Params) => {
    const { data, error } = (await supabase
      .from("devices")
      .insert({
        name,
        manufacturer,
      })
      .select()) as { data: DeviceRow[]; error: PostgrestError | null };

    if (error) {
      logger.error(
        error,
        `error creating new device: name: ${name} manufacturer: ${manufacturer} `
      );

      return;
    }

    if (!data || data.length <= 0) {
      logger.error("data not found creating new device");
      return;
    }

    return data[0];
  };

  const fetch = async ({ name, manufacturer }: Params) => {
    const { error, data } = (await supabase
      .from("devices")
      .select()
      .ilike("name", `%${name.toLowerCase()}%`)
      .ilike("manufacturer", `%${manufacturer.toLowerCase()}%`)
      .limit(1)
      .single()) as { error: PostgrestError | null; data: DeviceRow };

    if (error) {
      logger.error(error, "data not found creating new device");
      return;
    }

    return data;
  };

  return { fetch, create };
};
