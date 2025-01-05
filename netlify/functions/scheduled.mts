import type { Config } from "@netlify/functions";
import { getPaused } from "../../store";
import sync from "../../syncer";

export const config: Config = {
    schedule: "*/10 * * * *",
};

export default async () => {
    const isPaused = await getPaused();
    if (isPaused) {
        console.log("paused");
        return;
    } else {
        console.log("syncing");
        const result = await sync();
        console.log(await result.text());
    }
};
