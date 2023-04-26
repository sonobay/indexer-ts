import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
// import { MIDIMetadata, MIDIRow } from "../types/midi.types";

export interface CreateParams {
  tokenId: number;
  device: string;
}

export interface MidiDevices {
  create(p: CreateParams): Promise<{ error: PostgrestError | null }>;
  burn(id: number): Promise<{ error: PostgrestError | null }>;
}

/**
 * Associates MIDI with multiple DEVICES
 * @param supabase
 * @returns MidiDevices
 */
export const midiDevices = (supabase: SupabaseClient): MidiDevices => {
  const create = async ({ tokenId, device }: CreateParams) => {
    const { error } = await supabase.from("midi_devices").insert({
      midi: tokenId,
      device,
    });

    return { error };
  };

  /**
   * delete when total amount burned
   */
  const burn = async (id: number) => {
    const { error } = await supabase
      .from("midi_devices")
      .delete()
      .eq("midi", id);

    return { error };
  };

  return { create, burn };
};
