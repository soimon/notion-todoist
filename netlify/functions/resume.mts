import type { Config, Context } from "@netlify/functions";
import { setPaused } from "../../store";

export const config: Config = {
    path: "/resume",
};

export default async (req: Request, context: Context) => {
    await setPaused(false);
    return new Response("resumed");
};
