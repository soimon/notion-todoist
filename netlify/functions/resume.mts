import type { Config, Context } from "@netlify/functions";

export const config: Config = {
    path: "/resume",
};

export default async (req: Request, context: Context) => {
    return new Response("Resume");
};
