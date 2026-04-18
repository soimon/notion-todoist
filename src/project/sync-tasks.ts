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
import {NO_AREA, ProjectSchema} from './mutating/notion';
import {SyncPair} from './mutating/todoist';
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

		// Delete duplicated tasks (happens sometimes when the API's produce garbage)
		todoistTasks.duplicates.forEach(id => todoist.deleteTask(id));

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
			const parentId =
				task.parent_id && notionIdByTodoistId.get(task.parent_id);
			if (task.parent_id && !parentId) return;
			notion.createTask(
				{
					parentId,
					name: prefixNameWithRecurring(task.content, task.due?.is_recurring),
					areaId: projectsAreaMap.get(task.project_id),
					verb: task.labels.find(label => labels.verbs.has(label)),
					places: task.labels.filter(label => labels.places.has(label)),
					scheduledAt: task.due?.date ? new Date(task.due?.date) : undefined,
					deadline: task.deadline?.date
						? new Date(task.deadline.date)
						: undefined,
				},
				{todoistTaskId: task.id, todoistHash: task.contentHash}
			);
		});

		return {notionIdByTodoistId};
	}

	async function rehashAllTodoistTasks(
		{comments, tasks}: Preparation,
		{todoist}: MutationQueues
	) {
		const {synced} = mapTasksWithSyncDataFromComments(tasks, comments);
		const pairs: SyncPair[] = Array.from(synced.entries())
			.map(([notionId, task]) => ({
				notionId,
				commentId: task.syncCommentId,
				hash: task.contentHash,
			}))
			.filter(
				(pair): pair is typeof pair & {commentId: string} =>
					pair.commentId !== undefined
			);
		todoist.syncTaskPairs(pairs);
		return pairs;
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
		duplicates: string[];
		unsynced: SyncedTask[];
	};

	function mapTasksWithSyncDataFromComments(
		tasks: ApiTask[],
		comments: ApiComment[]
	): TodoistSyncData {
		const synced = new Map<string, SyncedTask>();
		const duplicates: string[] = [];

		const withSyncId = tasks.map<[string | undefined, SyncedTask]>(task => {
			const contentHash = generateContentHash({
				...task,
				date: task?.due?.date ? new Date(task.due.date) : undefined,
				deadline: task?.deadline?.date
					? new Date(task.deadline.date)
					: undefined,
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

		withSyncId
			.filter((v): v is [string, SyncedTask] => v[0] !== undefined)
			.forEach(([id, task]) => {
				const existing = synced.get(id);
				if (existing) {
					const {keep, toss} = chooseBetweenDuplicateSyncs(task, existing);
					synced.set(id, keep);
					duplicates.push(toss.id);
				} else synced.set(id, task);
			});

		return {
			synced,
			duplicates,
			unsynced: withSyncId.filter(([id]) => !id).map(([, task]) => task),
		};
	}

	const chooseBetweenDuplicateSyncs = (
		a: SyncedTask,
		b: SyncedTask
	): {keep: SyncedTask; toss: SyncedTask} => {
		if (a.due?.is_recurring) return {keep: a, toss: b};
		else if (b.due?.is_recurring) return {keep: b, toss: a};
		else if (a.due && !b.due) return {keep: a, toss: b};
		else if (b.due && !a.due) return {keep: b, toss: a};
		else if (new Date(a.added_at) > new Date(b.added_at))
			return {keep: a, toss: b};
		else return {keep: b, toss: a};
	};

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
		const scheduledAt = properties.ScheduledAt?.date
			? new Date(properties.ScheduledAt.date.start)
			: undefined;
		const pinAt = properties.PinAt?.date
			? new Date(properties.PinAt.date.start)
			: undefined;
		const waitingForDate = extractWaitingDate(properties.Waiting?.rich_text ?? []);
		const deadline = properties.Deadline?.date
			? new Date(properties.Deadline.date.start)
			: undefined;
		return {
			id,
			name: appifyNotionLinks(markdownName ?? ''),
			parents: getRelationIds(properties.Parent) ?? [],
			areas: getRelationIds(properties.Areas) ?? [],
			people: people?.type === 'string' ? people?.string?.split(',') ?? [] : [],
			places: properties.Places?.multi_select?.map(({name}) => name) ?? [],
			verb: properties.Verb?.select?.name,
			scheduledAt,
			pinAt,
			waitingForDate,
			pinned: properties.Pinned?.checkbox ?? false,
			deadline,
			children: [],
			todoistData,
			notionData: properties,
		};
	}

	function mapToHierarchy(projects: Map<string, TaskDTO>) {
		const root = new Map<string, TaskDTO[]>();
		projects.forEach(project => {
			const numParents = project.parents.length;
			if (numParents === 0) {
				const areasOrEmpty = project.areas.length ? project.areas : [NO_AREA];
				areasOrEmpty.forEach(area =>
					root.set(area, [...(root.get(area) || []), project])
				);
			} else
				project.parents.forEach(
					parent => projects.get(parent)?.children.push(project)
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

		const areasDiffer =
			parentInfo.areas.sort().join() !== task.areas.sort().join();
		if (areasDiffer) notion.fixTaskArea(task.id, parentInfo.areas);

		// Pinned syncing

		const now = new Date();
		if (task.pinned && task.pinAt && task.pinAt > now) {
			notion.unpinTask(task.id);
		} else if (!task.pinned && task.pinAt && task.pinAt <= now) {
			notion.pinTask(task.id);
		} else if (
			task.pinned &&
			task.pinAt &&
			shouldClearPinAtAfterOneDay(task.pinAt, now)
		) {
			notion.clearTaskPinAt(task.id);
		} else if (task.waitingForDate && task.waitingForDate <= now) {
			notion.pinTaskFromWaiting(task.id);
		}

		// Syncing between Todoist and Notion

		if (!id) {
			// Create
			if (action.includes(SyncAction.Create)) {
				id = todoist.createTask(
					{
						content: task.name,
						date: task.scheduledAt,
						deadline: task.deadline,
						...parentInfo,
						labels: generateLabelsTodoistShouldHave(task),
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
						content: removePrefixes(task.name),
						labels: generateLabelsTodoistShouldHave(task),
						date: task.scheduledAt,
						deadline: task.deadline,
					},
					{notionId: task.id, todoistCommentId: td.syncCommentId}
				);
			if (action.includes(SyncAction.UpdateInNotion) && td && td.syncCommentId)
				notion.updateTask(
					task.id,
					{
						name: prefixNameWithRecurring(
							removePrefixes(td.content),
							td.due?.is_recurring
						),
						verb: td.labels.find(label => labels.verbs.has(label)),
						places: td.labels.filter(label => labels.places.has(label)),
						scheduledAt: td.due?.date ? new Date(td.due?.date) : undefined,
						deadline: td.deadline?.date
							? new Date(td.deadline.date)
							: undefined,
					},
					{todoistCommentId: td.syncCommentId, todoistHash: td.contentHash}
				);
			if (action.includes(SyncAction.Move)) todoist.moveTask(id, parentInfo);
		}

		// Recurse

		task.children.forEach(child =>
			syncTaskTree(
				child,
				{todoist, notion},
				{
					parentId: id,
					areas: parentInfo.areas,
				},
				completedTasks,
				labels
			)
		);
	}

	const prefixNameWithRecurring = (
		name: string,
		isRecurring?: boolean
	): string => `${isRecurring ? props.recurringSymbol + ' ' : ''}${name}`;

	const removePrefixes = (name: string) =>
		name.replace(new RegExp(`^${props.recurringSymbol} `), '').trim();

	const generateLabelsTodoistShouldHave = (task: TaskDTO) => [
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
			if (!areTasksEqual(task, td)) {
				const isAlteredInTodoist =
					td.contentHash !== td.syncStamp?.hash || td.due?.is_recurring;
				actions.push(
					isAlteredInTodoist ? SyncAction.UpdateInNotion : SyncAction.Update
				);
			}
			if (isSomewhereElse(td, parentInfo)) actions.push(SyncAction.Move);
		}

		return actions;
	};

	const wasCompletedInTodoist = (task: TaskDTO, completedTasks: ApiTask[]) => {
		const completedTask = completedTasks.find(
			t => removePrefixes(t.content) === removePrefixes(task.name)
		);
		// Don't mark as complete in Notion if the completed task was recurring
		// Recurring tasks should always be synced from Todoist to Notion
		return (
			completedTask !== undefined && completedTask.due?.is_recurring !== true
		);
	};

	const areTasksEqual = (task: TaskDTO, todoistData: ApiTask) =>
		!isDateChanged(task, todoistData) &&
		!isDeadlineChanged(task, todoistData) &&
		task.name.trim() ===
			prefixNameWithRecurring(
				todoistData.content.trim(),
				todoistData.due?.is_recurring
			) &&
		task.todoistData?.labels.sort().join() ===
			generateLabelsTodoistShouldHave(task).sort().join();

	const isDateChanged = (task: TaskDTO, todoistData: ApiTask) =>
		(task.scheduledAt
			? makeIsoScheduledString(task.scheduledAt, false)
			: undefined) !== todoistData.due?.date;

	const isDeadlineChanged = (task: TaskDTO, todoistData: ApiTask) =>
		(task.deadline
			? makeIsoScheduledString(task.deadline, false)
			: undefined) !== todoistData.deadline?.date;

	const isSomewhereElse = (
		td: Pick<ApiTask, 'parent_id' | 'project_id'>,
		parentInfo: Pick<AddTaskArgs, 'parentId' | 'projectId' | 'sectionId'>
	) => {
		const todoistProjectId =
			td.project_id === process.env.TODOIST_PROJECT_INBOX
				? undefined
				: td.project_id;
		return (
			// eslint-disable-next-line eqeqeq
			td.parent_id != parentInfo.parentId ||
			(!td.parent_id &&
				// eslint-disable-next-line eqeqeq
				todoistProjectId != parentInfo.projectId)
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
		parents: string[];
		areas: string[];
		verb: string | undefined;
		people: string[];
		places: string[];
		scheduledAt?: Date;
		pinAt?: Date;
		waitingForDate?: Date;
		pinned: boolean;
		deadline?: Date;
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
		Name: {type: 'title', id: 'title'},
		Parent: {type: 'relation', id: props.schema.fields.parent},
		Areas: {type: 'relation', id: props.schema.fields.areas},
		Places: {type: 'multi_select', id: props.schema.fields.place},
		People: {type: 'formula', id: props.schema.fields.people},
		Verb: {type: 'select', id: props.schema.fields.verb},
		Waiting: {type: 'rich_text', id: props.schema.fields.waiting},
		ScheduledAt: {type: 'date', id: props.schema.fields.scheduledAt},
		Deadline: {type: 'date', id: props.schema.fields.deadline},
		PinAt: {type: 'date', id: props.schema.fields.pinAt},
		Pinned: {type: 'checkbox', id: props.schema.fields.pinned},
	});

	//--------------------------------------------------------------------------------
	// Return the actual function
	//--------------------------------------------------------------------------------

	return {prepare, stage, rehashAllTodoistTasks};
}

/**
 * Returns the date from the Waiting rich-text field if it contains exactly one
 * date mention (and nothing else). Plain-text values are for the user only and
 * are intentionally ignored by the syncer.
 */
function extractWaitingDate(
	richText: Array<{
		type: string;
		mention?: {type: string; date?: {start: string}};
	}>
): Date | undefined {
	if (richText.length !== 1) return undefined;
	const item = richText[0];
	if (item?.type !== 'mention') return undefined;
	if (item.mention?.type !== 'date') return undefined;
	const start = item.mention.date?.start;
	if (!start) return undefined;
	return new Date(start);
}

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

function shouldClearPinAtAfterOneDay(pinAt: Date, now: Date) {
	return now.getTime() >= pinAt.getTime() + MILLISECONDS_IN_DAY;
}
