declare namespace NodeJS {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface ProcessEnv {
		NOTION_TOKEN: string;
		NOTION_DB_AREAS: string;
		NOTION_DB_PROJECTS: string;
		NOTION_DB_ATTACHMENTS: string;

		TODOIST_TOKEN: string;
		TODOIST_PROJECT_AREAS: string;
		TODOIST_PROJECT_RESOURCES: string;

		IMGUR_TOKEN: string;

		DEV: string | undefined;
		IS_GITHUB_ACTION: string | undefined;

		GIST_PAT: string | undefined;
	}
}
