import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { MIDIMetadata, MIDIRow } from "../types/midi.types";

export interface CreateParams {
  id: number;
  metadata: MIDIMetadata;
  createdBy: string;
  totalSupply: number;
}

export interface Midi {
  create(p: CreateParams): Promise<{ error: PostgrestError | null }>;
  fetch(): Promise<{
    error: PostgrestError | null;
    data: MIDIRow[];
  }>;
  updateSupply(
    id: number,
    totalSupply: number
  ): Promise<{ error: PostgrestError | null }>;
}

export const midi = (supabase: SupabaseClient): Midi => {
  const create = async ({
    id,
    metadata,
    createdBy,
    totalSupply,
  }: CreateParams) => {
    const tags = metadata.properties.entries
      .map((midi) => midi.tags ?? [])
      .flat()
      .map((tag) => tag?.toUpperCase())
      .map((tag) => tag.trim());

    const { error } = await supabase.from("midi").insert({
      id,
      metadata,
      createdBy,
      tags: [...new Set(tags)],
      totalSupply,
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

  /**
   * Updates supply
   */
  const updateSupply = async (id: number, totalSupply: number) => {
    const { error } = await supabase
      .from("midi")
      .update({ totalSupply })
      .eq("id", id);

    return { error };
  };

  return { create, fetch, updateSupply };
};
