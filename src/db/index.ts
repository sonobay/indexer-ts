import { SupabaseClient } from "@supabase/supabase-js";
import { devices, Devices } from "./devices";
import { Midi, midi } from "./midi";
import { midiDevices, MidiDevices } from "./midiDevices";
import { Queue, queue } from "./queue";

export interface DB {
  queue: Queue;
  midi: Midi;
  devices: Devices;
  midiDevices: MidiDevices;
}

export const init = (supabase: SupabaseClient): DB => {
  return {
    queue: queue(supabase),
    midi: midi(supabase),
    devices: devices(supabase),
    midiDevices: midiDevices(supabase),
  };
};
