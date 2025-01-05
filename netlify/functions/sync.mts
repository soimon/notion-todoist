
import type { Config, Context } from "@netlify/functions";

export const config: Config = {
    path: "/sync",
};

const GITHUB_API_URL = 'https://api.github.com/repos/soimon/notion-todoist/actions/workflows/run.yml/dispatches';
const GITHUB_BRANCH = 'runner';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export default async (req: Request, context: Context) => {
    const response = await fetch(GITHUB_API_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'X-Github-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: GITHUB_BRANCH })
    });

    if (!response.ok) {
        return new Response(`failed: ${response.statusText}`, { status: response.status });
    }

    return new Response(`synced`);
};
