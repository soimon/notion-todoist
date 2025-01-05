import type { Config, Context } from "npm:@netlify/functions";

export const config: Config = {
    path: "/resume",
};

export default async (req: Request, context: Context) => {
    return new Response("Resume");
};
