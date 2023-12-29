import {Client} from '@notionhq/client';
import groupBy from 'object.groupby';
import {
	NotionGoal,
	NotionProject,
	pausedGoalStates,
	closedGoalStates,
	inProgressProjectStates,
} from '../models';
import {goalSchema, projectSchema} from './schemas';
import {QueryFilters, queryDatabase} from '@lib/notion';
import {Goal} from '@framework/models';

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
				const isBlocked = _goals.every(g => g.blockedState !== 'free');
				const isPaused = !!properties.blocked?.select?.name;
				this.storeIdMappings(_goals);
				return {
					syncId: properties.syncId?.rich_text[0]?.plain_text ?? '',
					name: properties.name?.title[0]?.plain_text ?? '',
					blockedState: isBlocked ? 'blocked' : isPaused ? 'paused' : 'free',
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
			const isBlocked = (properties.waitingFor?.relation.length ?? 0) > 0;
			const isPaused = pausedGoalStates.includes(
				properties.status?.status?.name ?? ''
			);
			return {
				syncId,
				name,
				blockedState: isBlocked ? 'blocked' : isPaused ? 'paused' : 'free',
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

	async addGoal(goal: Goal, projectSyncId: string) {
		return this.api.pages.create({
			parent: {
				database_id: this.goalDatabaseId,
			},
			properties: {
				[goalSchema.name.id]: {
					title: [
						{
							type: 'text',
							text: {
								content: goal.name,
							},
						},
					],
				},
				[goalSchema.project.id]: {
					relation: [
						{
							id: this.requireIdFromSyncId(projectSyncId),
						},
					],
				},
				[goalSchema.synccId.id]: {
					rich_text: [{type: 'text', text: {content: goal.syncId}}],
				},
			},
		});
	}

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
	a: Pick<NotionProject, 'blockedState'>,
	b: Pick<NotionProject, 'blockedState'>
): number =>
	(a.blockedState !== 'free' ? 1 : 0) - (b.blockedState !== 'free' ? 1 : 0);
