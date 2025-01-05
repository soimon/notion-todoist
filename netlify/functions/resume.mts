import type { Config, Context } from "@netlify/functions";
import { checkSecret, denyAccess } from "../../secret";
import { setPaused } from "../../store";

export const config: Config = {
    path: "/resume",
};

export default async (req: Request, context: Context) => {
    if(!checkSecret(req)) return denyAccess();
    await setPaused(false);
    return new Response("resumed");
};
