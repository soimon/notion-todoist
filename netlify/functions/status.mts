import type { Config, Context } from "@netlify/functions";
import { checkSecret, denyAccess } from "../../secret";
import { getPaused } from "../../store";

export const config: Config = {
    path: "/status",
};

export default async (req: Request, context: Context) => {
    if (!checkSecret(req)) return denyAccess();
    const isPaused = await getPaused();
    return new Response(isPaused ? "paused" : "scheduled");
};
