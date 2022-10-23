import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { BigNumber, Contract, getDefaultProvider, constants } from "ethers";
import { midiAbi } from "./abis/midi.abi";
import { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import fetch from "node-fetch";
import { MIDIMetadata, MIDIRow } from "./types/midi.types";
import { DeviceRow } from "./types/device.types";
import { createDB } from "./supabase";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
const midiAddress = process.env.MIDI_ADDRESS;
const providerEndpoint = process.env.PROVIDER_ENDPOINT;

const insertMidi = async (
  supabase: SupabaseClient,
  id: BigNumber,
  operator: string
) => {
  const { error } = await supabase.from("midi").insert({
    id: id.toNumber(),
    createdBy: operator,
  });
  if (error) {
    console.error("error inserting midi: ", error);
  }
};

const indexMetadata = async (
  supabase: SupabaseClient,
  midiInstance: Contract
) => {
  const { error, data } = (await supabase
    .from("midi")
    .select()
    .is("metadata", null)) as { error: PostgrestError | null; data: MIDIRow[] };
  console.log("indexing midi.metadata for: ", data);

  if (!data || data.length <= 0) {
    return;
  }

  if (error) {
    console.error("error fetching midi where midi is null");
    return;
  }

  for (const midi of data) {
    indexMIDI({ id: midi.id, supabase, midiInstance });
  }
};

const indexDevices = async (
  supabase: SupabaseClient,
  midiInstance: Contract
) => {
  const { error, data } = (await supabase
    .from("midi")
    .select()
    .is("device", null)
    .lte("deviceIndexAttempts", 10)) as {
    error: PostgrestError | null;
    data: MIDIRow[];
  };
  console.log("indexing midi.device for: ", data);

  if (error) {
    console.error("error fetching midi where device is null ", error);
    return;
  }

  if (!data || data.length <= 0) {
    return;
  }

  for (const midi of data) {
    indexDevice({ row: midi, supabase, midiInstance });
  }
};

const fetchMetadata = async (id: number, midiInstance: Contract) => {
  let uri = await midiInstance.uri(id);
  uri = uri.replace("ipfs://", "https://nftstorage.link/ipfs/");
  const res = await fetch(uri);
  if (!res.ok) {
    console.error("error fetching ", uri);
    return;
  }
  const metadata = (await res.json()) as MIDIMetadata;
  console.log("metadata is: ", metadata);
  return metadata;
};

const indexDevice = async ({
  row,
  supabase,
  midiInstance,
}: {
  row: MIDIRow;
  supabase: SupabaseClient;
  midiInstance: Contract;
}) => {
  const { id, deviceIndexAttempts } = row;

  const { error } = await supabase
    .from("midi")
    .update({ deviceIndexAttempts: deviceIndexAttempts + 1 })
    .eq("id", id);

  const metadata = await fetchMetadata(id, midiInstance);
  if (!metadata) {
    return;
  }

  /**
   * Check if metadata has device in properties
   */
  if (metadata.properties.device) {
    let device = await fetchDeviceByName({
      deviceName: metadata.properties.device,
      supabase,
    });

    /**
     * No device found in DB
     * Create a new one
     */
    if (!device) {
      const createdDevice = await createDevice({
        deviceName: metadata.properties.device,
        manufacturer: metadata.properties.manufacturer ?? "",
        supabase,
      });

      /**
       * Creating the device failed
       */
      if (!createdDevice) {
        console.error("creating device failed");
        return;
      }

      /**
       * otherwise we assign device
       */
      device = createdDevice;
    }

    console.log("device: ", device);

    const { error } = await supabase
      .from("midi")
      .update({ device: device.id })
      .eq("id", id);

    if (error) {
      console.error(`error updating MIDI: ${id} device ${device.id}`);
    }
  }
};

const indexMIDI = async ({
  id,
  supabase,
  midiInstance,
}: {
  id: number;
  supabase: SupabaseClient;
  midiInstance: Contract;
}) => {
  const metadata = await fetchMetadata(id, midiInstance);
  if (!metadata) {
    return;
  }

  const { error } = await supabase
    .from("midi")
    .update({ metadata })
    .eq("id", id);

  if (error) {
    console.error("error updating midi metadata: ", error);
  }
};

const createDevice = async ({
  deviceName,
  manufacturer,
  supabase,
}: {
  deviceName: string;
  manufacturer: string;
  supabase: SupabaseClient;
}) => {
  const { data, error } = (await supabase
    .from("devices")
    .insert({
      name: deviceName,
      manufacturer: manufacturer,
    })
    .select()) as { data: DeviceRow[]; error: PostgrestError | null };

  if (error) {
    console.error("error creating new device: ", error);
    return;
  }

  if (!data || data.length <= 0) {
    console.error("data not found creating new device");
    return;
  }

  return data[0];
};

const fetchDeviceByName = async ({
  deviceName,
  supabase,
}: {
  deviceName: string;
  supabase: SupabaseClient;
}) => {
  console.log("searching: ", deviceName);

  const { error, data } = (await supabase
    .from("devices")
    .select()
    .ilike("name", `%${deviceName.toLowerCase()}%`)
    .limit(1)
    .single()) as { error: PostgrestError | null; data: DeviceRow };

  if (error) {
    console.error("error fetchDeviceByName ", error);
    return;
  }

  return data;
};

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Serverrrr");
});

app.get("/devices", async (req: Request, res: Response) => {
  const supabase = await createDB();

  const { error, data } = (await supabase.from("devices").select()) as {
    error: PostgrestError | null;
    data: DeviceRow[];
  };

  if (error) {
    console.error("error fetchDeviceByName ", error);
    return res.json({ error }).status(500);
  }

  return res.json(data);
});

app.get(`/devices/:deviceId`, async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  const supabase = await createDB();

  const { error, data } = await supabase
    .from("devices")
    .select("*, midi(createdBy, device, id, metadata)")
    .eq("id", deviceId)
    .single();

  if (error) {
    console.error("error fetching device by id ", error);
    return res.json({ error }).status(500);
  }

  return res.json(data);
});

app.listen(port, async () => {
  if (!midiAddress) {
    throw new Error("process.env.MIDI_ADDRESS not set");
  }

  if (!providerEndpoint) {
    throw new Error("process.env.INFURA_ENDPOINT not set");
  }

  const supabase = await createDB();

  const midiInstance = new Contract(
    midiAddress,
    midiAbi,
    getDefaultProvider(providerEndpoint)
  );

  midiInstance.on(
    "TransferSingle",
    (operator: string, from: string, to: string, id: BigNumber) => {
      console.log("operator: ", operator);
      console.log("from: ", from);
      console.log("to: ", to);
      console.log("id: ", id);

      if (from === constants.AddressZero) {
        insertMidi(supabase, id, operator);
      }
    }
  );

  setInterval(() => {
    indexMetadata(supabase, midiInstance);
    indexDevices(supabase, midiInstance);
  }, 60 * 1000); // 60 * 1000 milsec

  console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
});
