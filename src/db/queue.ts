import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { BigNumber } from "ethers";
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
  fetch(): Promise<QueueRow[]>;
}

export const queue = (supabase: SupabaseClient): Queue => {
  const create = async (id: BigNumber, error: string, operator: string) => {
    const { error: postgresError } = await supabase.from("queue").insert({
      id: id.toNumber(),
      attempts: 1,
      error,
      operator,
    });

    if (error) {
      console.error(
        `error inserting ${id.toNumber()} to queue: `,
        postgresError
      );
    }
  };

  const remove = async (id: BigNumber) => {
    const { error } = await supabase
      .from("queue")
      .delete()
      .eq("id", id.toNumber());

    if (error) {
      console.error(`error deleting ${id.toNumber()} from queue: `, error);
    }
  };

  /**
   * updates queue item
   */
  const update = async ({ id, attempts, error }: UpdateParams) => {
    const { error: postgresError } = await supabase
      .from("queue")
      .update({ attempts, error: error })
      .eq("id", id);

    if (error) {
      console.error(`error deleting ${id} from queue: `, postgresError);
    }
  };

  /**
   * Fetches everything in the queue table
   * where processing attempts are less than 10
   * @returns everything in the queue
   */
  const fetch = async (): Promise<QueueRow[]> => {
    const { error, data } = (await supabase
      .from("queue")
      .select()
      .lt("attempts", 10)) as {
      error: PostgrestError | null;
      data: QueueRow[];
    };

    if (error) {
      console.error(`error fetching queue rows: `, error);
    }

    return data;
  };

  return { create, update, remove, fetch };
};
