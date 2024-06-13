import {
	defineSchema,
	extractIdFromLink,
	getPlainText,
	NotionPage,
	queryDatabase,
} from '@lib/notion';
import {normalizeId} from '@lib/notion/parsing';
import {ApiProject, Color} from '@lib/todoist';
import {
	forEachRecord,
	groupBy,
	mapRecord,
	sortRecord,
} from '@lib/utils/collections';
import {Integrations} from './integrations';
import {MutationQueues} from './mutating';

export function createProjectSyncer<C extends Record<string, Color>>({
	rootProjects,
	notionToTodoistColors,
	areaSchemaIds,
	colorOrder,
}: {
	rootProjects: Record<string, string>;
	notionToTodoistColors: C;
	areaSchemaIds: {
		database: string;
		type: string;
		emoji: string;
		category: string;
	};
	colorOrder: (keyof C)[];
}) {
	async function prepare({todoist, notion}: Integrations) {
		return {
			projects: todoist.getProjects(),
			projectComments: todoist.getProjectComments(),
			areas: await queryDatabase({
				notion,
				database: areaSchemaIds.database,
				schema: areaSchema,
			}),
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	function stage(
		preparation: Preparation,
		{todoist}: MutationQueues
	): {areaProjectsMap: Map<string, string>} {
		// Fetch and structure all information from Notion and Todoist

		const todoistProjects =
			getTodoistProjectsWithSyncIdFromProjectComments(preparation);
		const areas = mapFlatNotionAreasToTodoistHierarchy(
			preparation.areas,
			todoistProjects
		);

		// Go through the root projects
		const areaProjectsMap = new Map<string, string>();

		forEachRecord(areas, (rootProjectName, type) => {
			const rootProjectId = rootProjects[rootProjectName];
			if (!rootProjectId) return;

			// Sync the category projects
			forEachRecord(type, (name, category) => {
				const action = determineCategoryAction({
					name,
					color: category.color ?? '',
					todoistData: category.todoistData,
				});

				if (action === SyncAction.Create) {
					// Create
					const newTodoistId = todoist.createProject(
						{
							name,
							color: category.color,
							parentId: rootProjectId,
						},
						{notionId: category.id}
					);
					type[name]!.todoistId = newTodoistId;
				} else if (action === SyncAction.Update && category.todoistId) {
					// Update
					todoist.updateProject(category.todoistId, {
						name: name,
						color: category.color,
					});
					console.log(`Update project ${name}`);
				}

				// Sync the areas
				category.areas.forEach(({id, name, color, todoistData}) => {
					const actions = determineAreaActions({
						name,
						color: color ?? '',
						categoryId: category.todoistId,
						todoistData,
					});

					if (actions.includes(SyncAction.Create) && category.todoistId) {
						// Create
						const projectId = todoist.createProject(
							{
								name,
								color,
								parentId: category.todoistId,
							},
							{notionId: id}
						);
						areaProjectsMap.set(id, projectId);
					} else if (todoistData) {
						areaProjectsMap.set(id, todoistData.id);

						// Update
						if (actions.includes(SyncAction.Update))
							todoist.updateProject(todoistData.id, {name, color});

						// Move
						if (actions.includes(SyncAction.Move) && category.todoistId)
							todoist.moveProject(todoistData.id, category.todoistId);
					}
				});
			});
		});

		// Return the map of area ids mapped to projects
		return {areaProjectsMap};
	}

	//--------------------------------------------------------------------------------
	// Mapping Notion to Todoist
	//--------------------------------------------------------------------------------

	function getTodoistProjectsWithSyncIdFromProjectComments({
		projects,
		projectComments,
	}: Preparation): SyncedTodoistProject[] {
		const linkedProjects = projects.map(project => {
			const firstComment = projectComments.filter(
				c => c.project_id === project.id
			)[0];
			return {
				notionId: extractIdFromLink(firstComment?.content),
				...project,
			};
		});
		return linkedProjects;
	}

	const mapFlatNotionAreasToTodoistHierarchy = (
		results: NotionArea[],
		projects: SyncedTodoistProject[]
	) => {
		const todoistTDOs = mapNotionAreasToTodoist(results, projects);
		const areasByType = groupBy('type', todoistTDOs);

		return mapRecord(areasByType, areasOfType => {
			const areasByCategory = groupBy('category', areasOfType);
			return sortRecord(
				byColor,
				mapRecord(areasByCategory, areasWithinCategory => {
					const firstChild = areasWithinCategory[0]!;
					const id = firstChild.categoryId;
					const todoistData = projects.find(project => project.notionId === id);
					return {
						id,
						color: firstChild.color,
						areas: areasWithinCategory,
						todoistId: todoistData?.id,
						todoistData,
					};
				})
			);
		});
	};

	const mapNotionAreasToTodoist = (
		results: NotionArea[],
		projects: SyncedTodoistProject[]
	): TodoistAreaDTO[] => {
		return results
			.map(({id, name, properties, icon}) => {
				id = normalizeId(id);
				const category = properties.category?.select;
				return {
					id,
					name: mapName(name, properties),
					color: mapColor(icon),
					category: category?.name ?? '',
					categoryId: category ? normalizeId(category.id) : '',
					type: properties.type?.select?.name ?? '',
					todoistData: projects.find(project => project.notionId === id),
				};
			})
			.filter(p => p.type !== '');
	};

	const mapName = (
		name: string | undefined,
		properties: NotionArea['properties']
	) =>
		`${properties.emoji ? getPlainText(properties.emoji) + ' ' : ''}${
			name ?? '?'
		}`;

	const mapColor = (icon: NotionArea['icon']) =>
		notionToTodoistColors[
			icon?.type === 'external'
				? icon.external.url.match(/_([a-z]+)\.svg/)?.[1] ?? ''
				: ''
		];

	const byColor = (
		[, {color: colorA}]: [string, {color?: string}],
		[, {color: colorB}]: [string, {color?: string}]
	): number =>
		colorOrder.indexOf(colorA ?? '') - colorOrder.indexOf(colorB ?? '');

	colorOrder = colorOrder.map(c => notionToTodoistColors[c] ?? '');

	//--------------------------------------------------------------------------------
	// Syncing
	//--------------------------------------------------------------------------------

	function determineCategoryAction({
		name,
		color,
		todoistData,
	}: {
		name: string;
		color: string;
		todoistData?: ApiProject;
	}): SyncAction {
		return todoistData === undefined
			? SyncAction.Create
			: name !== todoistData.name || color !== todoistData.color
			? SyncAction.Update
			: SyncAction.Ignore;
	}

	function determineAreaActions({
		name,
		color,
		categoryId,
		todoistData,
	}: {
		name: string;
		color: string;
		categoryId?: string;
		todoistData?: ApiProject;
	}): SyncAction[] {
		const actions: SyncAction[] = [];
		const shouldCreate = todoistData === undefined;
		if (shouldCreate) actions.push(SyncAction.Create);
		else {
			const shouldUpdate =
				name !== todoistData.name || color !== todoistData.color;
			const shouldMove = categoryId && todoistData.parent_id !== categoryId;
			if (shouldUpdate) actions.push(SyncAction.Update);
			if (shouldMove) actions.push(SyncAction.Move);
		}
		return actions.length > 0 ? actions : [SyncAction.Ignore];
	}

	//--------------------------------------------------------------------------------
	// Types and schemas
	//--------------------------------------------------------------------------------

	enum SyncAction {
		Create,
		Update,
		Move,
		Ignore,
	}

	type TodoistAreaDTO = {
		id: string;
		name: string;
		color?: string;
		type: string;
		category: string;
		categoryId: string;
		todoistData?: SyncedTodoistProject;
	};
	type SyncedTodoistProject = ApiProject & {notionId?: string};
	type NotionArea = NotionPage<typeof areaSchema>;

	const areaSchema = defineSchema({
		type: {type: 'select', id: areaSchemaIds.type},
		emoji: {type: 'rich_text', id: areaSchemaIds.emoji},
		category: {type: 'select', id: areaSchemaIds.category},
	});

	//--------------------------------------------------------------------------------
	// Return the actual function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}
