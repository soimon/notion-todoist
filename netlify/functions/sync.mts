
import type { Config, Context } from "@netlify/functions";
import { checkSecret, denyAccess } from "../../secret";
import sync from "../../syncer";

export const config: Config = {
    path: "/sync",
};

export default async (req: Request, context: Context) => {
    if(!checkSecret(req)) return denyAccess();
    return await sync();
};
