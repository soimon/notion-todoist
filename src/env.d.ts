declare namespace NodeJS {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface ProcessEnv {
		NOTION_TOKEN: string;
		NOTION_DB_PROJECTS: string;
		NOTION_DB_GOALS: string;
		NOTION_DB_TASKS: string;

		TODOIST_TOKEN: string;
		TODOIST_PROJECT_ROOT: string;

		DEV: string | undefined;
		IS_GITHUB_ACTION: string | undefined;

		GIST_PAT: string | undefined;
	}
}
