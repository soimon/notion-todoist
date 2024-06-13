import {TodoistSyncApi} from '@lib/todoist';
import {Client} from '@notionhq/client';
import {NoteSchema, NotionMutationQueue, ProjectSchema} from './notion';
import {TodoistMutationQueue} from './todoist';

export type MutationQueues = {
	todoist: TodoistMutationQueue;
	notion: NotionMutationQueue;
};
export const createMutationQueues = (
	todoist: TodoistSyncApi,
	notion: Client,
	projectSchema: ProjectSchema,
	noteSchema: NoteSchema
) => ({
	todoist: new TodoistMutationQueue(todoist),
	notion: new NotionMutationQueue(notion, projectSchema, noteSchema),
});
