import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { BigNumber } from "ethers";
import { logger } from "..";
import { QueueRow } from "../types/queue.types";

export interface UpdateParams {
  id: number;
  attempts: number;
  error: string;
}

export interface Queue {
  create(id: BigNumber, error: string, operator: string): Promise<void>;
  remove(id: BigNumber): Promise<void>;
  update(p: UpdateParams): Promise<void>;
  fetch(attempts: number): Promise<QueueRow[]>;
}

export const queue = (supabase: SupabaseClient): Queue => {
  const create = async (id: BigNumber, error: string, operator: string) => {
    const { error: postgresError } = await supabase.from("queue").insert({
      id: id.toNumber(),
      attempts: 1,
      error,
      operator,
    });

    if (postgresError) {
      logger.error(
        postgresError,
        `error inserting ${id.toNumber()} to queue: `
      );
    }

    return;
  };

  const remove = async (id: BigNumber) => {
    const { error } = await supabase
      .from("queue")
      .delete()
      .eq("id", id.toNumber());

    if (error) {
      logger.error(error, `error deleting ${id.toNumber()} from queue`);
    }

    return;
  };

  /**
   * updates queue item
   */
  const update = async ({ id, attempts, error }: UpdateParams) => {
    const { error: postgresError } = await supabase
      .from("queue")
      .update({ attempts, error: error })
      .eq("id", id);

    if (postgresError) {
      logger.error(postgresError, `error deleting ${id} from queue`);
    }

    return;
  };

  /**
   * Fetches everything in the queue table
   * where processing attempts are less than 10
   * @returns everything in the queue
   */
  const fetch = async (attempts: number): Promise<QueueRow[]> => {
    const { error, data } = (await supabase
      .from("queue")
      .select()
      .lt("attempts", attempts)) as {
      error: PostgrestError | null;
      data: QueueRow[] | null;
    };

    if (error) {
      logger.error(error, `error fetching queue rows`);
    }

    return data ?? [];
  };

  return { create, update, remove, fetch };
};
