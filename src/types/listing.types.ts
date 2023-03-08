import type { BigNumber } from "ethers";

export type ListingRow = {
  tokenId: BigNumber;
  listingAddress: string;
  amount: BigNumber;
  price: BigNumber;
  lister: string;
};
