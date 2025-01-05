import type { Config, Context } from "@netlify/functions";
import { getPaused } from "../../store";
import sync from "../../syncer";

export const config: Config = {
    schedule: "*/10 * * * *",
};

export default async (req: Request, context: Context) => {
    const isPaused = await getPaused();
    if (isPaused) return new Response("paused");
    else return await sync();
};
