import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { BigNumber } from "ethers";
import { logger } from "..";
import { ListingRow } from "../types/listing.types";

interface CreateParams {
  tokenId: BigNumber;
  listingAddress: string;
  amount: BigNumber;
  price: BigNumber;
  lister: string;
}

export interface Listings {
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
      logger.error(
        error,
        `error creating new listing: listing_address: ${listingAddress}`
      );
      return;
    }

    if (!data || data.length <= 0) {
      logger.error("data not found creating new listing");

      return;
    }

    return data[0];
  };

  return { create };
};
