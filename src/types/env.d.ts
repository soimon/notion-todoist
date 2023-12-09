declare namespace NodeJS {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface ProcessEnv {
		NOTION_TOKEN: string;
		NOTION_DB_PROJECTS: string;
		NOTION_DB_TASKS: string;

		TODOIST_TOKEN: string;
	}
}
