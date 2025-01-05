import type { Config, Context } from "@netlify/functions";

export const config: Config = {
    path: "/pause",
};

export default async (req: Request, context: Context) => {
    return new Response("Pause");
};
