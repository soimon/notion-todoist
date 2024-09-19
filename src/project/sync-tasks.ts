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
import {extractSyncStamp, generateContentHash, SyncStamp} from './syncstamp';

export type ConfigProps = {
	schema: ProjectSchema;
	onlySyncThisArea?: string;
	recurringSymbol: string;
	postponedSymbol: string;
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
					{projectId, areas: [areaId], goals: task.goals},
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
					waitingForDate: task.due?.date ? new Date(task.due?.date) : undefined,
				},
				{todoistTaskId: task.id, todoistHash: task.contentHash}
			);
		});

		return {notionIdByTodoistId};
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
		const goalArea = properties['@Goalarea']?.formula;
		const waitingForDate = extractDateFromWaitingText(properties.Waiting);
		return {
			id,
			name: appifyNotionLinks(markdownName ?? ''),
			parents: getRelationIds(properties.Parent) ?? [],
			areas: getRelationIds(properties.Areas) ?? [],
			goals: getRelationIds(properties.Goal) ?? [],
			people: people?.type === 'string' ? people?.string?.split(',') ?? [] : [],
			places: properties.Places?.multi_select?.map(({name}) => name) ?? [],
			verb: properties.Verb?.select?.name,
			waitingForDate,
			isPostponed: checkPostponed(properties, waitingForDate),
			isScheduled: properties['@Scheduled']?.checkbox ?? false,
			goalArea:
				goalArea?.type === 'string' ? goalArea.string ?? undefined : undefined,
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

	const checkPostponed = (
		properties: NotionProject['properties'],
		waitingForDate: Date | undefined
	) =>
		(properties['@Postponed']?.formula?.type === 'boolean'
			? Boolean(properties['@Postponed']?.formula.boolean)
			: false) ||
		(Boolean(properties.Waiting?.rich_text.length) && !waitingForDate);

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
		const goalsDiffer =
			parentInfo.goals.sort().join() !== task.goals.sort().join();
		const areaIsEmptyButHasGoalWithArea =
			!goalsDiffer &&
			!areasDiffer &&
			parentInfo.areas.length === 1 &&
			parentInfo.areas[0] === '' &&
			task.goalArea;
		if (areasDiffer || goalsDiffer || areaIsEmptyButHasGoalWithArea)
			notion.fixTaskAreaAndGoal(
				task.id,
				areaIsEmptyButHasGoalWithArea && task.goalArea
					? [task.goalArea]
					: parentInfo.areas,
				parentInfo.goals
			);

		if (!id) {
			// Create
			if (action.includes(SyncAction.Create)) {
				id = todoist.createTask(
					{
						content: prefixNameWithPostponed(task.name, task.isPostponed),
						date: task.waitingForDate,
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
						content: prefixNameWithPostponed(
							removePrefixes(task.name),
							task.isPostponed
						),
						labels: generateLabelsTodoistShouldHave(task),
						date: task.waitingForDate,
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
						waitingForDate: td.due?.date ? new Date(td.due?.date) : undefined,
					},
					task.notionData,
					{todoistCommentId: td.syncCommentId, todoistHash: td.contentHash}
				);
			if (action.includes(SyncAction.Move)) todoist.moveTask(id, parentInfo);
		}

		if (action.includes(SyncAction.ReflagInNotion))
			notion.updateTaskFlags(task.id, {
				isScheduled: !!(action.includes(SyncAction.Update) ||
				action.includes(SyncAction.Create)
					? task.waitingForDate
					: task.todoistData?.due?.date),
			});

		// Recurse

		task.children.forEach(child =>
			syncTaskTree(
				child,
				{todoist, notion},
				{
					parentId: id,
					areas: parentInfo.areas,
					goals: parentInfo.goals.length ? parentInfo.goals : child.goals,
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

	const prefixNameWithPostponed = (
		name: string,
		isPostponed?: boolean
	): string => `${isPostponed ? props.postponedSymbol + ' ' : ''}${name}`;

	const removePrefixes = (name: string) =>
		name
			.replace(new RegExp(`^${props.recurringSymbol} `), '')
			.replace(new RegExp(`^${props.postponedSymbol} `), '')
			.trim();

	const generateLabelsTodoistShouldHave = (task: TaskDTO) =>
		task.isPostponed
			? []
			: [...(task.verb ? [task.verb] : []), ...task.places, ...task.people];

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
					(td.contentHash !== td.syncStamp?.hash || td.due?.is_recurring) &&
					!task.isPostponed;
				actions.push(
					isAlteredInTodoist ? SyncAction.UpdateInNotion : SyncAction.Update
				);
			}
			if (isSomewhereElse(td, parentInfo)) actions.push(SyncAction.Move);
		}

		// Reflagging

		const shouldBeScheduled = !!(actions.includes(SyncAction.Update) ||
		actions.includes(SyncAction.Create)
			? task.waitingForDate
			: task.todoistData?.due?.date);
		if (shouldBeScheduled !== task.isScheduled)
			actions.push(SyncAction.ReflagInNotion);
		return actions;
	};

	const wasCompletedInTodoist = (task: TaskDTO, completedTasks: ApiTask[]) => {
		return (
			completedTasks.find(
				t => removePrefixes(t.content) === removePrefixes(task.name)
			) !== undefined
		);
	};

	const areTasksEqual = (task: TaskDTO, todoistData: ApiTask) =>
		!isDateChanged(task, todoistData) &&
		prefixNameWithPostponed(task.name.trim(), task.isPostponed) ===
			prefixNameWithRecurring(
				todoistData.content.trim(),
				todoistData.due?.is_recurring
			) &&
		task.todoistData?.labels.sort().join() ===
			generateLabelsTodoistShouldHave(task).sort().join();

	const isDateChanged = (task: TaskDTO, todoistData: ApiTask) =>
		(task.waitingForDate
			? makeIsoScheduledString(task.waitingForDate, false)
			: undefined) !== todoistData.due?.date;

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
		ReflagInNotion,
	}

	type TaskDTO = {
		id: string;
		name: string;
		parents: string[];
		areas: string[];
		goals: string[];
		verb: string | undefined;
		people: string[];
		places: string[];
		isPostponed?: boolean;
		isScheduled?: boolean;
		goalArea?: string;
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
	> & {areas: string[]; goals: string[]};

	const taskSchema = defineSchema({
		'@Archived': {
			type: 'formula',
			id: props.schema.fields.archivedState,
		},
		'@Postponed': {
			type: 'formula',
			id: props.schema.fields.isPostponed,
		},
		'@Goalarea': {
			type: 'formula',
			id: props.schema.fields.goalArea,
		},
		'@Scheduled': {
			type: 'checkbox',
			id: props.schema.fields.isScheduled,
		},
		Name: {type: 'title', id: 'title'},
		Todoist: {type: 'url', id: props.schema.fields.todoist},
		Parent: {type: 'relation', id: props.schema.fields.parent},
		Areas: {type: 'relation', id: props.schema.fields.areas},
		Goal: {type: 'relation', id: props.schema.fields.goals},
		Places: {type: 'multi_select', id: props.schema.fields.place},
		People: {type: 'formula', id: props.schema.fields.people},
		Verb: {type: 'select', id: props.schema.fields.verb},
		Waiting: {type: 'rich_text', id: props.schema.fields.waiting},
		Archived: {type: 'select', id: props.schema.fields.reviewState},
	});

	//--------------------------------------------------------------------------------
	// Return the actual function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}
