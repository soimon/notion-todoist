import type { Config, Context } from "@netlify/functions";
import { setPaused } from "../../store";

export const config: Config = {
    path: "/pause",
};

export default async (req: Request, context: Context) => {
    await setPaused(true);
    return new Response("paused");
};
