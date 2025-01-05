import { getStore } from "@netlify/blobs";

const STORE_NAME = "sync";
const PROPERTY_NAME = "isPaused";

export async function getPaused(): Promise<boolean> {
    const syncStore = getStore(STORE_NAME);
    const isPaused = await syncStore.get(PROPERTY_NAME, { type: "json" });
    return !!isPaused;
}

export async function setPaused(isPaused: boolean) {
    const syncStore = getStore(STORE_NAME);
    if (isPaused) await syncStore.set(PROPERTY_NAME, "true");
    else await syncStore.delete(PROPERTY_NAME);
}
