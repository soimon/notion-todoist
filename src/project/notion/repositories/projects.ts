import {Client} from '@notionhq/client';
import groupBy from 'object.groupby';
import {
	NotionGoal,
	NotionProject,
	blockedGoalStates,
	closedGoalStates,
	inProgressProjectStates,
} from '../models';
import {goalSchema, projectSchema} from './schemas';
import {QueryFilters, queryDatabase} from '@lib/notion';

export class NotionProjectRepository {
	constructor(
		private api: Client,
		private projectDatabaseId: string,
		private goalDatabaseId: string
	) {}

	// Fetching

	async getProjects(): Promise<NotionProject[]> {
		const goals = await this.getGoals().then(g =>
			groupBy(g, ({notion}) => notion.projectId)
		);
		const projects = (await this.fetchProjects())
			.map(({id, properties}): NotionProject => {
				const _goals = goals[id]?.sort(sortByBlocked) ?? [];
				this.storeIdMappings(_goals);
				return {
					syncId: properties.syncId?.rich_text[0]?.plain_text ?? '',
					name: properties.name?.title[0]?.plain_text ?? '',
					isBlocked: _goals.every(g => g.isBlocked) ?? false,
					goals: _goals,
					notion: {
						id,
					},
				};
			})
			.sort(sortByBlocked);
		this.storeIdMappings(projects);
		return projects;
	}

	private async getGoals(): Promise<NotionGoal[]> {
		return (await this.fetchGoals()).map(({id, properties}): NotionGoal => {
			const name = properties.name?.title[0]?.plain_text ?? '';
			const syncId = properties.synccId?.rich_text[0]?.plain_text ?? '';
			const projectId = properties.project?.relation[0]?.id ?? '';
			const isBlocked =
				(properties.waitingFor?.relation.length ?? 0) > 0 ||
				blockedGoalStates.includes(properties.status?.status?.name ?? '');
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

	// Id mapping

	private idMappings: Record<
		(NotionGoal | NotionProject)['syncId'],
		(NotionGoal | NotionProject)['notion']['id']
	> = {};

	requireIdFromSyncId(syncId: string) {
		const id = this.idMappings[syncId];
		if (!id) throw new Error(`No goal/project found with sync ID ${syncId}`);
		return id;
	}

	private storeIdMappings(items: (NotionGoal | NotionProject)[]) {
		for (const item of items) this.idMappings[item.syncId] = item.notion.id;
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

	async linkGoal(goal: NotionGoal, syncId: string) {
		return this.api.pages.update({
			page_id: goal.notion.id,
			properties: {
				[goalSchema.synccId.id]: {
					rich_text: [{type: 'text', text: {content: syncId}}],
				},
			},
		});
	}
}

// Filters

const goalIsNotDoneOrOrphanedFilter: QueryFilters = {
	and: [
		...closedGoalStates.map(state => ({
			property: goalSchema['status'].id,
			status: {
				does_not_equal: state,
			},
		})),
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
		...inProgressProjectStates.map(state => ({
			property: projectSchema['status'].id,
			status: {
				equals: state,
			},
		})),
	],
};

// Sorters

const sortByBlocked = (
	a: Pick<NotionProject, 'isBlocked'>,
	b: Pick<NotionProject, 'isBlocked'>
): number => (a.isBlocked ? 1 : 0) - (b.isBlocked ? 1 : 0);
