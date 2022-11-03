import express, { Express } from "express";
import dotenv from "dotenv";
import { BigNumber, Contract, getDefaultProvider, constants } from "ethers";
import { midiAbi } from "./abis/midi.abi";
import fetch from "node-fetch";
import { MIDIMetadata } from "./types/midi.types";
import { createDB } from "./supabase";
import { DB, init } from "./db";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
const midiAddress = process.env.MIDI_ADDRESS;
const providerEndpoint = process.env.PROVIDER_ENDPOINT;
const timeout = process.env.TIMEOUT ? +process.env.TIMEOUT : 300000; // defaults to 5 minutes

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

const indexById = async ({
  db,
  id,
  operator,
  midiInstance,
}: {
  db: DB;
  id: number;
  operator: string;
  midiInstance: Contract;
}): Promise<{ error: string | undefined }> => {
  const metadata = await fetchMetadata(id, midiInstance);

  if (!metadata) {
    return { error: `failed fetching metadata` };
  }

  /**
   * Check if metadata has device in properties
   */
  if (metadata.properties.device) {
    let device = await db.devices.fetchByName({
      deviceName: metadata.properties.device,
    });

    /**
     * No device found in DB
     * Create a new one
     */
    if (!device) {
      const createdDevice = await db.devices.create({
        name: metadata.properties.device,
        manufacturer: metadata.properties.manufacturer ?? "",
      });

      /**
       * Creating the device failed
       */
      if (!createdDevice) {
        console.error("creating device failed");
        return {
          error: `creating device failed failed for ${metadata.properties.manufacturer}: ${metadata.properties.device}`,
        };
      }

      /**
       * otherwise we assign device
       */
      device = createdDevice;
    }

    const { error } = await db.midi.create({
      id,
      metadata,
      device: device.id,
      createdBy: operator,
    });

    if (error) {
      console.error("error updating midi metadata: ", error);
      return {
        error: `failed creating midi: ${error.details} ${error.message}`,
      };
    }

    return { error: undefined };
  } else {
    return { error: "no metadata.properties.device property" };
  }
};

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

  const db = init(supabase);

  midiInstance.on(
    "TransferSingle",
    async (operator: string, from: string, to: string, id: BigNumber) => {
      console.log("operator: ", operator);
      console.log("from: ", from);
      console.log("to: ", to);
      console.log("id: ", id);

      /**
       * newly minted
       */
      if (from === constants.AddressZero) {
        const { error } = await indexById({
          db,
          id: id.toNumber(),
          operator,
          midiInstance,
        });

        /**
         * if failed, create new queue row
         */
        if (error) {
          db.queue.create(id, error, operator);
        }
      }
    }
  );

  /**
   * Process queue
   */
  setInterval(async () => {
    /**
     * fetch queue
     */
    const queue = await db.queue.fetch();

    /**
     * loop
     */
    for (const row of queue) {
      const { error } = await indexById({
        db,
        id: row.id,
        midiInstance,
        operator: row.operator,
      });

      /**
       * if failed, updated queue row attempts and error message
       */
      if (error) {
        await db.queue.update({
          id: row.id,
          attempts: row.attempts + 1,
          error,
        });
      }
    }
  }, timeout);

  console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
});
