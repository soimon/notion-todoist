import {Client} from '@notionhq/client';
import groupBy from 'object.groupby';
import {QueryFilters, queryDatabase} from '../../wrappers/notion';
import {NotionGoal, NotionProject} from './model';
import {goalSchema, projectSchema} from './schemas';

// TODO: Move all magic constants to business logic

export class NotionProjectRepository {
	constructor(
		private api: Client,
		private projectDatabaseId: string,
		private goalDatabaseId: string
	) {}

	// Fetching

	async getProjects(): Promise<NotionProject[]> {
		const projects = await this.fetchProjects();
		const goals = await this.getGoals().then(g =>
			groupBy(g, ({notion}) => notion.projectId)
		);

		return projects
			.map(({id, properties}): NotionProject => {
				return {
					syncId: properties.syncId?.rich_text[0]?.plain_text ?? '',
					name: properties.name?.title[0]?.plain_text ?? '',
					isBlocked: goals[id]?.every(g => g.isBlocked) ?? false,
					goals: goals[id]?.sort(sortByBlocked) ?? [],
					notion: {
						id,
					},
				};
			})
			.sort(sortByBlocked);
	}

	private async getGoals(): Promise<NotionGoal[]> {
		return (await this.fetchGoals()).map(({id, properties}): NotionGoal => {
			const name = properties.name?.title[0]?.plain_text ?? '';
			const syncId = properties.todoistId?.rich_text[0]?.plain_text ?? '';
			const projectId = properties.project?.relation[0]?.id ?? '';
			const isBlocked =
				(properties.waitingFor?.relation.length ?? 0) > 0 ||
				properties.status?.status?.name === 'Paused';
			return {
				syncId,
				name,
				isBlocked,
				notion: {
					id,
					projectId,
				},
			};
		});
	}

	private async fetchProjects() {
		return queryDatabase({
			notion: this.api,
			database: this.projectDatabaseId,
			schema: projectSchema,
			filter: projectIsActionableFilter,
		});
	}

	private async fetchGoals() {
		return await queryDatabase({
			notion: this.api,
			database: this.goalDatabaseId,
			schema: goalSchema,
			filter: goalIsNotDoneOrOrphanedFilter,
		});
	}

	// Altering

	async linkProject(project: NotionProject, syncId: string) {
		return this.api.pages.update({
			page_id: project.notion.id,
			properties: {
				[projectSchema.syncId.id]: {
					rich_text: [{type: 'text', text: {content: syncId}}],
				},
			},
		});
	}
}

// Filters

const goalIsNotDoneOrOrphanedFilter: QueryFilters = {
	and: [
		{
			property: goalSchema['status'].id,
			status: {
				does_not_equal: 'Done',
			},
		},
		{
			property: goalSchema['project'].id,
			relation: {
				is_not_empty: true,
			},
		},
	],
};

const projectIsActionableFilter: QueryFilters = {
	or: [
		{
			property: projectSchema['status'].id,
			status: {
				equals: '2: Outlining',
			},
		},
		{
			property: projectSchema['status'].id,
			status: {
				equals: '3: In progress',
			},
		},
		{
			property: projectSchema['status'].id,
			status: {
				equals: 'Wrapping',
			},
		},
	],
};

// Sorters

const sortByBlocked = (
	a: Pick<NotionProject, 'isBlocked'>,
	b: Pick<NotionProject, 'isBlocked'>
): number => (a.isBlocked ? 1 : 0) - (b.isBlocked ? 1 : 0);
