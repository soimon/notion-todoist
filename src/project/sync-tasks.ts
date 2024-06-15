import {AddTaskArgs} from '@doist/todoist-api-typescript';
import {
	appifyNotionLinks,
	defineSchema,
	getRelationIds,
	normalizeId,
	NotionPage,
	queryDatabase,
} from '@lib/notion';
import {ApiComment, ApiTask, TodoistSyncApi} from '@lib/todoist';
import {flipMap} from '@lib/utils/collections';
import {makeIsoScheduledString} from '@lib/utils/time';
import {Client as NotionClient} from '@notionhq/client';
import {Integrations} from './integrations';
import {MutationQueues} from './mutating';
import {ProjectSchema} from './mutating/notion';
import {extractSyncStamp, generateContentHash, SyncStamp} from './syncstamp';

export type ConfigProps = {
	schema: ProjectSchema;
	onlySyncThisArea?: string;
	recurringSymbol: string;
};

export function createTaskSyncer(props: ConfigProps) {
	async function prepare(
		{todoist, incrementalTodoist, notion}: Integrations,
		areaProjectsMap: Map<string, string>,
		labels: {verbs: Set<string>; places: Set<string>}
	) {
		const dev = getDevAlterations(areaProjectsMap, todoist);
		return {
			areaProjectsMap,
			labels,
			tasks: dev.tasks ?? todoist.getTasks(),
			comments: todoist.getComments(),
			incrementalTasks: incrementalTodoist.getTasks(),
			notionTasks: await fetchVisibleNotionTasks(notion, dev.filter),
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	function getDevAlterations(
		areaProjectsMap: Map<string, string>,
		todoist: TodoistSyncApi
	) {
		if (!props.onlySyncThisArea) return {};
		const devProject = areaProjectsMap.get(props.onlySyncThisArea);
		const devFilteredTasks = todoist
			.getTasks()
			.filter(t => t.project_id === devProject);
		return {
			tasks: devFilteredTasks,
			filter: [
				{
					property: props.schema.fields.areas,
					relation: {
						contains: props.onlySyncThisArea,
					},
				},
			],
		};
	}

	function stage(
		{
			areaProjectsMap,
			labels,
			comments,
			tasks,
			notionTasks,
			incrementalTasks,
		}: Preparation,
		{todoist, notion}: MutationQueues
	) {
		// Fetch and structure all information

		const todoistTasks = mapTasksWithSyncDataFromComments(tasks, comments);
		const tree = mapFlatResultsToHierarchy(notionTasks, todoistTasks);
		const projectsAreaMap = flipMap(areaProjectsMap);
		const notionIdByTodoistId = new Map(
			Array.from(todoistTasks.synced.entries()).map(([notionId, task]) => [
				task.id,
				notionId,
			])
		);

		// Sync recursively from root to leaf (from Notions perspective)

		const completedTasks = getCompletedTasks(incrementalTasks);
		for (const [areaId, tasks] of tree) {
			const projectId = areaProjectsMap.get(areaId);
			if (!projectId) continue;
			for (const task of tasks)
				syncTaskTree(
					task,
					{todoist, notion},
					{projectId, areas: [areaId]},
					completedTasks,
					labels
				);
		}

		// Delete tasks that had been synced but are not in Notion anymore

		const notionIds = new Set(notionTasks.map(({id}) => normalizeId(id)));
		const orphanTasks = Array.from(todoistTasks.synced.entries()).filter(
			([id]) => !notionIds.has(id)
		);
		orphanTasks.forEach(([, task]) => todoist.deleteTask(task.id));

		// Add tasks that are added in Todoist

		const newlyAddedTasks = todoistTasks.unsynced.filter(t =>
			projectsAreaMap.has(t.project_id)
		);

		newlyAddedTasks.forEach(task => {
			// Check if it has a parent and if that is already created.
			// If not, wait for the next rounds of sync to create it.
			// This means that a new three level task will be created in three syncs:
			// otherwise the entire tree would have to be constructed from Todoists
			// perspective as well.
			const goalId = task.parent_id && notionIdByTodoistId.get(task.parent_id);
			if (task.parent_id && !goalId) return;
			notion.createTask(
				{
					goalId,
					name: prefixNameWithRecurring(task.content, task.due?.is_recurring),
					areaId: projectsAreaMap.get(task.project_id),
					verb: task.labels.find(label => labels.verbs.has(label)),
					places: task.labels.filter(label => labels.places.has(label)),
					waitingForDate: task.due?.date ? new Date(task.due?.date) : undefined,
				},
				{todoistTaskId: task.id, todoistHash: task.contentHash}
			);
		});
	}

	//--------------------------------------------------------------------------------
	// Todoist data querying and structuring
	//--------------------------------------------------------------------------------

	type SyncedTask = ApiTask & {
		syncStamp?: SyncStamp;
		contentHash: string;
		syncCommentId?: string;
	};
	type TodoistSyncData = {
		synced: Map<string, SyncedTask>;
		unsynced: SyncedTask[];
	};

	function mapTasksWithSyncDataFromComments(
		tasks: ApiTask[],
		comments: ApiComment[]
	): TodoistSyncData {
		const withSyncId = tasks.map<[string | undefined, SyncedTask]>(task => {
			const contentHash = generateContentHash({
				...task,
				date: task?.due?.date ? new Date(task.due.date) : undefined,
			});
			const myComments = comments.filter(c => c.item_id === task.id);
			for (const comment of myComments) {
				const syncStamp = extractSyncStamp(comment.content);
				if (syncStamp)
					return [
						syncStamp.notionId,
						{...task, contentHash, syncStamp, syncCommentId: comment.id},
					];
			}
			return [undefined, {...task, contentHash}];
		});

		return {
			synced: new Map(
				withSyncId.filter((v): v is [string, SyncedTask] => v[0] !== undefined)
			),
			unsynced: withSyncId.filter(([id]) => !id).map(([, task]) => task),
		};
	}

	const getCompletedTasks = (incrementalTasks: ApiTask[]) =>
		incrementalTasks.filter(t => t.completed_at);

	//--------------------------------------------------------------------------------
	// Notion data querying and structuring
	//--------------------------------------------------------------------------------

	function fetchVisibleNotionTasks(
		notion: NotionClient,
		filter: ReturnType<typeof getDevAlterations>['filter']
	) {
		return queryDatabase({
			notion,
			schema: taskSchema,
			database: props.schema.database,
			filter: {
				and: [
					{
						property: props.schema.fields.archivedState,
						formula: {string: {equals: props.schema.filterValueOfActive}},
					},
					...(filter ?? []),
				],
			},
		});
	}

	const mapFlatResultsToHierarchy = (
		projects: NotionProject[],
		tasks: TodoistSyncData
	) => {
		const dtosById = transformProjectsToDTOs(projects, tasks);
		return mapToHierarchy(dtosById);
	};

	const transformProjectsToDTOs = (
		projects: NotionProject[],
		tasks: TodoistSyncData
	) =>
		new Map(
			projects.map(project => [
				normalizeId(project.id),
				transformToDTO(project, tasks),
			])
		);

	function transformToDTO(
		{id: _id, markdownName, properties}: NotionProject,
		tasks: TodoistSyncData
	): TaskDTO {
		const id = normalizeId(_id);
		const todoistData = tasks.synced.get(id);
		const people = properties.People?.formula;
		const waitingForDate = extractDateFromWaitingText(properties.Waiting);
		return {
			id,
			name: appifyNotionLinks(markdownName ?? ''),
			goals: getRelationIds(properties.Goal) ?? [],
			areas: getRelationIds(properties.Areas) ?? [],
			people: people?.type === 'string' ? people?.string?.split(',') ?? [] : [],
			places: properties.Places?.multi_select?.map(({name}) => name) ?? [],
			verb: properties.Verb?.select?.name,
			waitingForDate,
			children: [],
			todoistData,
			notionData: properties,
		};
	}

	function extractDateFromWaitingText(
		waiting: NotionProject['properties']['Waiting']
	): Date | undefined {
		if (!waiting) return;
		const firstItem = waiting.rich_text[0];
		if (!firstItem) return;
		if (firstItem.type === 'mention' && firstItem.mention.type === 'date') {
			return new Date(firstItem.mention.date.start);
		} else return;
	}

	function mapToHierarchy(projects: Map<string, TaskDTO>) {
		const root = new Map<string, TaskDTO[]>();
		projects.forEach(project => {
			const numParents = project.goals.length;
			if (numParents === 0)
				project.areas.forEach(area =>
					root.set(area, [...(root.get(area) || []), project])
				);
			else
				project.goals.forEach(
					goal => projects.get(goal)?.children.push(project)
				);
		});
		return root;
	}

	//--------------------------------------------------------------------------------
	// Todoist syncing
	//--------------------------------------------------------------------------------

	function syncTaskTree(
		task: TaskDTO,
		{todoist, notion}: MutationQueues,
		parentInfo: ParentInfo,
		completedTasks: ApiTask[],
		labels: Preparation['labels']
	) {
		if (task.syncChecked) return;
		task.syncChecked = true;

		const action: SyncAction[] = determineTaskActions(
			task,
			parentInfo,
			completedTasks
		);
		let id = task.todoistData?.id;

		// Fix the area field in Notion

		if (parentInfo.areas.sort().join() !== task.areas.sort().join())
			notion.fixTaskArea(task.id, parentInfo.areas);

		if (!id) {
			// Create
			if (action.includes(SyncAction.Create)) {
				id = todoist.createTask(
					{
						content: task.name,
						date: task.waitingForDate,
						...parentInfo,
						labels: generateLabels(task),
					},
					{notionId: task.id}
				);
			}

			// Complete
			else if (action.includes(SyncAction.CompleteInNotion))
				notion.completeTask(task.id);
		}

		// Update
		else {
			const td = task.todoistData;
			if (action.includes(SyncAction.Update) && td)
				todoist.updateTask(
					id,
					{
						content: task.name,
						labels: generateLabels(task),
						date: task.waitingForDate,
					},
					{notionId: task.id, todoistCommentId: td.syncCommentId}
				);
			if (action.includes(SyncAction.UpdateInNotion) && td && td.syncCommentId)
				notion.updateTask(
					task.id,
					{
						name: prefixNameWithRecurring(td.content, td.due?.is_recurring),
						verb: td.labels.find(label => labels.verbs.has(label)),
						places: td.labels.filter(label => labels.places.has(label)),
						waitingForDate: td.due?.date ? new Date(td.due?.date) : undefined,
					},
					task.notionData,
					{todoistCommentId: td.syncCommentId, todoistHash: td.contentHash}
				);
			if (action.includes(SyncAction.Move)) todoist.moveTask(id, parentInfo);
		}

		// Recurse

		task.children.forEach(child =>
			syncTaskTree(
				child,
				{todoist, notion},
				{parentId: id, areas: parentInfo.areas},
				completedTasks,
				labels
			)
		);
	}

	const prefixNameWithRecurring = (
		name: string,
		isRecurring?: boolean
	): string => `${isRecurring ? props.recurringSymbol + ' ' : ''}${name}`;

	const generateLabels = (task: TaskDTO) => [
		...(task.verb ? [task.verb] : []),
		...task.places,
		...task.people,
	];

	const determineTaskActions = (
		task: TaskDTO,
		parentInfo: ParentInfo,
		completedTasks: ApiTask[]
	) => {
		const actions = [];
		if (!task.todoistData) {
			if (wasCompletedInTodoist(task, completedTasks))
				actions.push(SyncAction.CompleteInNotion);
			else if (task.name) actions.push(SyncAction.Create);
		} else {
			const td = task.todoistData;
			const isAlteredInTodoist =
				td.contentHash !== td.syncStamp?.hash || td.due?.is_recurring;
			if (!areTasksEqual(task, td))
				actions.push(
					isAlteredInTodoist ? SyncAction.UpdateInNotion : SyncAction.Update
				);
			if (isSomewhereElse(td, parentInfo)) actions.push(SyncAction.Move);
		}
		return actions;
	};

	const wasCompletedInTodoist = (task: TaskDTO, completedTasks: ApiTask[]) => {
		return (
			completedTasks.find(
				t =>
					t.content.replace(props.recurringSymbol, '').trim() ===
					task.name.replace(props.recurringSymbol, '').trim()
			) !== undefined
		);
	};

	const areTasksEqual = (task: TaskDTO, todoistData: ApiTask) =>
		(task.waitingForDate
			? makeIsoScheduledString(task.waitingForDate, false)
			: undefined) === todoistData.due?.date &&
		task.name.trim() ===
			prefixNameWithRecurring(
				todoistData.content.trim(),
				todoistData.due?.is_recurring
			) &&
		task.todoistData?.labels.sort().join() ===
			generateLabels(task).sort().join();

	const isSomewhereElse = (
		td: Pick<ApiTask, 'parent_id' | 'project_id'>,
		parentInfo: Pick<AddTaskArgs, 'parentId' | 'projectId' | 'sectionId'>
	) => {
		return (
			// eslint-disable-next-line eqeqeq
			td.parent_id != parentInfo.parentId ||
			// eslint-disable-next-line eqeqeq
			(!td.parent_id && td.project_id != parentInfo.projectId)
		);
	};

	//--------------------------------------------------------------------------------
	// Types and schemas
	//--------------------------------------------------------------------------------

	enum SyncAction {
		Create,
		Update,
		Move,
		CompleteInNotion,
		UpdateInNotion,
	}

	type TaskDTO = {
		id: string;
		name: string;
		goals: string[];
		areas: string[];
		verb: string | undefined;
		people: string[];
		places: string[];
		waitingForDate?: Date;
		children: TaskDTO[];
		todoistData?: SyncedTask;
		notionData: NotionProject['properties'];
		syncChecked?: boolean;
	};
	type NotionProject = NotionPage<typeof taskSchema>;
	type ParentInfo = Pick<
		AddTaskArgs,
		'parentId' | 'projectId' | 'sectionId'
	> & {areas: string[]};

	const taskSchema = defineSchema({
		'@Archived': {
			type: 'formula',
			id: props.schema.fields.archivedState,
		},
		Name: {type: 'title', id: 'title'},
		Todoist: {type: 'url', id: props.schema.fields.todoist},
		Goal: {type: 'relation', id: props.schema.fields.goal},
		Areas: {type: 'relation', id: props.schema.fields.areas},
		Places: {type: 'multi_select', id: props.schema.fields.place},
		People: {type: 'formula', id: props.schema.fields.people},
		Verb: {type: 'select', id: props.schema.fields.verb},
		Waiting: {type: 'rich_text', id: props.schema.fields.waiting},
		Archived: {type: 'select', id: props.schema.fields.archived},
	});

	//--------------------------------------------------------------------------------
	// Return the actual function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}
