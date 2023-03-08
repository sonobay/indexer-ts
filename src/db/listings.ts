import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { BigNumber } from "ethers";
import { ListingRow } from "../types/listing.types";

interface CreateParams {
  tokenId: BigNumber;
  listingAddress: string;
  amount: BigNumber;
  price: BigNumber;
  lister: string;
}

interface FetchParams {
  deviceId?: string;
  userId?: string;
}

export interface Listings {
  fetchAll(p: FetchParams): Promise<{ listings: ListingRow[] } | undefined>;
  create(p: CreateParams): Promise<ListingRow | undefined>;
}

export const listings = (supabase: SupabaseClient): Listings => {
  const create = async ({
    tokenId,
    listingAddress,
    amount,
    price,
    lister,
  }: CreateParams) => {
    const { data, error } = (await supabase
      .from("listings")
      .insert({
        listing_address: listingAddress,
        token_id: tokenId.toNumber(),
        amount: amount.toNumber(),
        price: price.toString(),
        seller_address: lister,
      })
      .select()) as { data: ListingRow[]; error: PostgrestError | null };

    if (error) {
      console.error(
        `error creating new listing: listing_address: ${listingAddress}`,
        error
      );
      return;
    }

    if (!data || data.length <= 0) {
      console.error("data not found creating new listing");
      return;
    }

    console.log("data[0] is: ", data[0]);

    return data[0];
  };

  const _fetchByUserAndDevice = async ({
    sellerAddress,
    deviceId,
  }: {
    sellerAddress: string;
    deviceId: string;
  }) => {
    const { error, data } = (await supabase
      .from("listings")
      .select("*, midi_devices(midi(id, created_by, metadata), device")
      .eq("seller_address", sellerAddress)
      .eq("midi_devices.device", deviceId)) as unknown as {
      error: PostgrestError | null;
      data: ListingRow[];
    };

    return { error, data };
  };
  const _fetchByUser = async ({ sellerAddress }: { sellerAddress: string }) => {
    const { error, data } = (await supabase
      .from("listings")
      .select("*, midi_devices(midi(id, created_by, metadata)")
      .eq("seller_address", sellerAddress)) as unknown as {
      error: PostgrestError | null;
      data: ListingRow[];
    };

    return { error, data };
  };
  const _fetchByDevice = async ({ deviceId }: { deviceId: string }) => {
    const { error, data } = (await supabase
      .from("listings")
      .select("*, midi_devices(midi(id, created_by, metadata), device")
      .eq("midi_devices.device", deviceId)) as unknown as {
      error: PostgrestError | null;
      data: ListingRow[];
    };

    return { error, data };
  };

  const fetchAll = async ({ userId, deviceId }: FetchParams) => {
    if (!userId && !deviceId) {
      console.error("neither userId nor deviceId provided");
      return;
    }

    let listings: ListingRow[];

    if (userId && deviceId) {
      // fetch by user for single device
      const { error, data } = await _fetchByUserAndDevice({
        sellerAddress: userId,
        deviceId,
      });
      if (error) {
        console.error(
          `error fetchAll listings - fetchByUserAndDevice ${{
            sellerAddress: userId,
            deviceId,
          }}`
        );
        return;
      }

      listings = data;
    } else if (userId && !deviceId) {
      // fetch by user for any device
      const { error, data } = await _fetchByUser({ sellerAddress: userId });

      if (error) {
        console.error(
          `error fetchAll listings - fetchByUser - ${{ sellerAddress: userId }}`
        );
        return;
      }

      listings = data;
    } else if (!userId && deviceId) {
      // fetch by device
      const { error, data } = await _fetchByDevice({ deviceId });

      if (error) {
        console.error(
          `error fetchAll listings - fetchByDevice - ${{ deviceId }}`
        );
        return;
      }

      listings = data;
    } else {
      listings = [];
    }

    return { listings };
  };

  return { fetchAll, create };
};
