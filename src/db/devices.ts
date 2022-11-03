import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { DeviceRow } from "../types/device.types";

interface CreateParams {
  name: string;
  manufacturer: string;
}

export interface Devices {
  fetchByName(p: { deviceName: string }): Promise<DeviceRow | undefined>;
  create(p: CreateParams): Promise<DeviceRow | undefined>;
}

export const devices = (supabase: SupabaseClient): Devices => {
  const create = async ({ name, manufacturer }: CreateParams) => {
    const { data, error } = (await supabase
      .from("devices")
      .insert({
        name,
        manufacturer: manufacturer,
      })
      .select()) as { data: DeviceRow[]; error: PostgrestError | null };

    if (error) {
      console.error(
        `error creating new device: name: ${name} manufacturer: ${manufacturer} `,
        error
      );
      return;
    }

    if (!data || data.length <= 0) {
      console.error("data not found creating new device");
      return;
    }

    return data[0];
  };

  const fetchByName = async ({ deviceName }: { deviceName: string }) => {
    const { error, data } = (await supabase
      .from("devices")
      .select()
      .ilike("name", `%${deviceName.toLowerCase()}%`)
      .limit(1)
      .single()) as { error: PostgrestError | null; data: DeviceRow };

    if (error) {
      console.error(`error fetchDeviceByName searching ${deviceName}`, error);
      return;
    }

    return data;
  };

  return { fetchByName, create };
};
