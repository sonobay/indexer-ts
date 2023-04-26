import express, { Express } from "express";
import dotenv from "dotenv";
import { BigNumber, Contract, constants, ethers } from "ethers";
import { midiAbi } from "./abis/midi.abi";
import fetch from "node-fetch";
import { MIDIMetadata } from "./types/midi.types";
import { createDB } from "./supabase";
import { DB, init } from "./db";
import { marketAbi } from "./abis/market.abi";
import pino from "pino";
import { WebSocketProvider } from "./websocket-provider";

export const logger = pino({
  name: "sonobay-indexer",
});

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
const midiAddress = process.env.MIDI_ADDRESS;
const marketAddress = process.env.MARKET_ADDRESS;
const providerEndpoint = process.env.PROVIDER_ENDPOINT;
const timeout = process.env.TIMEOUT ? +process.env.TIMEOUT : 300000; // defaults to 5 minutes
const validityCheckTimeout = process.env.VALIDITY_CHECK_TIMEOUT
  ? +process.env.VALIDITY_CHECK_TIMEOUT
  : 86400000;

const fetchMetadata = async (id: number, midiInstance: Contract) => {
  let uri = await midiInstance.uri(id);
  uri = uri.replace("ipfs://", "https://nftstorage.link/ipfs/");
  const res = await fetch(uri);
  if (!res.ok) {
    logger.error(`error fetching: ${uri} `);

    return;
  }
  const metadata = (await res.json()) as MIDIMetadata;
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
  if (metadata.properties.devices) {
    const devices: string[] = [];

    for (const device of metadata.properties.devices) {
      let existingDevice = await db.devices.fetch({
        name: device.name,
        manufacturer: device.manufacturer,
      });

      /**
       * No device found in DB
       * Create a new one
       */
      if (existingDevice) {
        devices.push(existingDevice.id);
      } else {
        const createdDevice = await db.devices.create({
          name: device.name,
          manufacturer: device.manufacturer ?? "",
        });

        /**
         * Creating the device failed
         */
        if (!createdDevice) {
          logger.error("creating device failed");
          return {
            error: `creating device failed failed for ${device.manufacturer}: ${device.name}`,
          };
        }

        /**
         * otherwise we assign device
         */
        // device = createdDevice;
        devices.push(createdDevice.id);
      }
    }

    const { error } = await db.midi.create({
      id,
      metadata,
      createdBy: operator,
    });

    if (error) {
      logger.error(error, "error updating midi metadata");
      return {
        error: `failed creating midi: ${error.details} ${error.message}`,
      };
    }

    const deviceIndexLength = devices.length <= 5 ? devices.length : 5;

    /**
     * Restrict indexing to a maximum of 5 devices per MIDI
     */
    for (let i = 0; i < deviceIndexLength; i++) {
      await db.midiDevices.create({ tokenId: id, device: devices[i] });
    }

    return { error: undefined };
  } else {
    return { error: "no metadata.properties.device property" };
  }
};

const fetchOriginalMinter = async (id: number, midiInstance: Contract) => {
  ethers.constants.AddressZero;

  /**
   * fetch all TransferSingle where the from address was 0x0
   * (meaning it was newly minted)
   */
  const transferFromSingleEvents = await midiInstance.queryFilter(
    midiInstance.filters.TransferSingle(
      null,
      ethers.constants.AddressZero,
      null,
      null,
      null
    ),
    7853362
  );

  /**
   * find an event that matches the id we're searching for
   */
  const targetEvent = transferFromSingleEvents.find(
    (event) => event.args?.id.toNumber() === id
  );

  if (!targetEvent) {
    logger.error("no target event found");
    return;
  }

  return targetEvent.args?.operator;
};

/**
 * this is run periodically to check that the DB matches what is on chain
 */
const sync = async ({
  db,
  midiInstance,
}: {
  db: DB;
  midiInstance: Contract;
}) => {
  const currentID = (await midiInstance.currentTokenId()) as BigNumber;
  const { data } = await db.midi.fetch();
  const queue = await db.queue.fetch(1000);
  const queueIDs = queue.map((row) => row.id);

  /**
   * discrepency exists
   */
  if (currentID.toNumber() !== data.length) {
    /**
     * build an array of 1 to currentID.toNumber()
     * representing the onchain token ids
     */
    const tokenIDs = Array.from(
      { length: currentID.toNumber() },
      (_, i) => i + 1
    );

    const dbRowIDs = data.map((row) => row.id);

    /**
     * filter for ids that do not exist in the DB
     */
    const diff = tokenIDs.filter((id) => !dbRowIDs.includes(id));

    /**
     * if the id already exists in the queue, we can ignore it
     * it has either failed too many times already
     * or will be picked up by indexer
     */
    const unqueueDiff = diff.filter((id) => !queueIDs.includes(id));

    /**
     * loop the difference
     */
    for (const id of unqueueDiff) {
      /**
       * fetch the operator
       */
      const operator = await fetchOriginalMinter(id, midiInstance);
      if (!operator) {
        logger.error(`failed fetching operator for ${id}`);
        return;
      }

      indexById({ db, id, midiInstance, operator });
    }
  }
};

const handleBurn = async ({
  id,
  midiInstance,
  db,
}: {
  id: BigNumber;
  midiInstance: Contract;
  db: DB;
}) => {
  /**
   * fetch total supply by id
   */
  const totalSupply = await midiInstance.totalSupply(id);

  /**
   * If total supply is 0, we can remove the midi from the DB
   */
  if (totalSupply <= 0) {
    await db.midiDevices.burn(id.toNumber());
    await db.midi.burn(id.toNumber());
  }
};

app.listen(port, async () => {
  if (!midiAddress) {
    throw new Error("process.env.MIDI_ADDRESS not set");
  }

  if (!marketAddress) {
    throw new Error("process.env.MARKET_ADDRESS not set");
  }

  if (!providerEndpoint) {
    throw new Error("process.env.PROVIDER_ENDPOINT not set");
  }

  const supabase = await createDB();

  // const provider = new ethers.providers.WebSocketProvider(providerEndpoint);
  const provider = new WebSocketProvider(providerEndpoint);

  provider._websocket.on("close", () => {
    logger.fatal("!!! WEBSOCKET HAS CLOSED !!!");
  });

  provider._websocket.on("open", () => {
    logger.info("websocket opened");
  });

  const midiInstance = new Contract(midiAddress, midiAbi, provider);

  const marketInstance = new Contract(marketAddress, marketAbi, provider);

  const db = init(supabase);

  midiInstance.on(
    "TransferSingle",
    async (operator: string, from: string, to: string, id: BigNumber) => {
      logger.info(
        {
          operator,
          from,
          to,
          id: id.toString(),
        },
        "on.TransferSingle"
      );

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

      /**
       * burn
       */
      if (to === constants.AddressZero) {
        await handleBurn({ id, midiInstance, db });
      }
    }
  );

  marketInstance.on(
    "ListingCreated",
    async (
      tokenId: BigNumber,
      listingAddress: string,
      amount: BigNumber,
      price: BigNumber,
      lister: string
    ) => {
      logger.info(
        {
          tokenId,
          listingAddress,
          amount,
          price,
          lister,
        },
        "on.ListingCreated"
      );
      db.listings.create({
        tokenId,
        listingAddress,
        amount,
        price,
        lister,
      });
    }
  );

  /**
   * Process queue
   */
  setInterval(async () => {
    /**
     * fetch queue
     */
    const queue = await db.queue.fetch(10);

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

  /**
   * to ensure consistency
   * we check the DB against the blockchain to make sure they're in sync
   */
  setInterval(() => {
    sync({ db, midiInstance });
  }, validityCheckTimeout);

  logger.info(`⚡️[sonobay-indexer]: running at https://localhost:${port}`);
});
