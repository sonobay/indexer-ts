import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { MIDIMetadata } from "../types/midi.types";

export interface CreateParams {
  id: number;
  metadata: MIDIMetadata;
  device: number;
  createdBy: string;
}

export interface Midi {
  create(p: CreateParams): Promise<{ error: PostgrestError | null }>;
}

export const midi = (supabase: SupabaseClient): Midi => {
  const create = async ({ id, metadata, device, createdBy }: CreateParams) => {
    const { error } = await supabase.from("midi").insert({
      id: id,
      metadata,
      device,
      createdBy,
    });

    return { error };
  };

  return { create };
};
