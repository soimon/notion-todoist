import type { Config, Context } from "@netlify/functions";
import { getPaused } from "../../store";
import sync from "./sync.mjs";

export const config: Config = {
    path: "/scheduled",
};

export default async (req: Request, context: Context) => {
    const isPaused = await getPaused();
    if (isPaused) return new Response("Sync is paused.");
    else return sync(req, context);
};
