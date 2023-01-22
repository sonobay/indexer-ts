import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { MIDIMetadata, MIDIRow } from "../types/midi.types";

export interface CreateParams {
  id: number;
  metadata: MIDIMetadata;
  createdBy: string;
}

export interface Midi {
  create(p: CreateParams): Promise<{ error: PostgrestError | null }>;
  fetch(): Promise<{
    error: PostgrestError | null;
    data: MIDIRow[];
  }>;
}

export const midi = (supabase: SupabaseClient): Midi => {
  const create = async ({ id, metadata, createdBy }: CreateParams) => {
    const tags = metadata.properties.entries
      .map((midi) => midi.tags ?? [])
      .flat()
      .map((tag) => tag?.toUpperCase())
      .map((tag) => tag.trim());

    const { error } = await supabase.from("midi").insert({
      id,
      metadata,
      createdBy,
      tags,
    });

    return { error };
  };

  /**
   * used for validity indexing
   * @returns all MIDI rows
   */
  const fetch = async () => {
    const { error, data } = (await supabase.from("midi").select()) as {
      error: PostgrestError | null;
      data: MIDIRow[];
    };

    return { error, data };
  };

  return { create, fetch };
};
