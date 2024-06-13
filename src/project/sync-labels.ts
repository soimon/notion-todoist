import {getDatabaseSchema, Schema} from '@lib/notion';
import {ApiLabel, Color} from '@lib/todoist';
import {Integrations} from './integrations';
import {MutationQueues} from './mutating';
import {ProjectSchema} from './mutating/notion';
import {TodoistMutationQueue} from './mutating/todoist';

export type ConfigProps = {
	projectSchema: ProjectSchema;
	verbColor: Color;
	placeColor: Color;
};

export function createLabelSyncer(props: ConfigProps) {
	async function prepare({todoist, notion}: Integrations) {
		return {
			schema: await getDatabaseSchema({
				notion,
				database: props.projectSchema.database,
			}),
			labels: todoist.getLabels(),
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	function stage({schema, labels}: Preparation, {todoist}: MutationQueues) {
		// Get and structure all data

		const verbs = getVerbs(schema);
		const places = getPlaces(schema);

		// Sync them

		const startOrder = syncLabelType(verbs, props.verbColor, labels, todoist);
		syncLabelType(places, props.placeColor, labels, todoist, startOrder);

		// Export data

		return {
			verbs: new Set(verbs.map(v => v.name)),
			places: new Set(places.map(p => p.name)),
		};
	}

	//--------------------------------------------------------------------------------
	// Notion
	//--------------------------------------------------------------------------------

	const getVerbs = (schema: Schema) =>
		getLabelsFromSchema(schema, props.projectSchema.fields.verb, 'select');
	const getPlaces = (schema: Schema) =>
		getLabelsFromSchema(
			schema,
			props.projectSchema.fields.place,
			'multi_select'
		);

	function getLabelsFromSchema(
		schema: Schema,
		propId: string,
		propType: 'select' | 'multi_select'
	): Label[] {
		const labels = ((
			Object.values(schema).find(
				p => typeof p === 'object' && p.id === propId && p.type === propType
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			) as any
		)?.[propType]?.options ?? []) as Label[] | undefined;
		return labels ?? [];
	}

	//--------------------------------------------------------------------------------
	// Syncing
	//--------------------------------------------------------------------------------

	function syncLabelType(
		tags: Label[],
		color: Color,
		labels: ApiLabel[],
		todoist: TodoistMutationQueue,
		startOrder = 0
	): number {
		const sorted = tags.sort((a, b) => {
			if (a.color === b.color) return b.name.localeCompare(a.name);
			return a.color.localeCompare(b.color);
		});
		sorted.forEach(tag => {
			const syncedLabel = labels.find(label => label.name === tag.name);
			if (!syncedLabel)
				todoist.createLabel({name: tag.name, color, order: startOrder});
			else if (
				syncedLabel.color !== color ||
				syncedLabel.item_order !== startOrder
			) {
				todoist.updateLabel(syncedLabel.id, {
					name: tag.name,
					color,
					order: startOrder,
				});
			}
			startOrder++;
		});
		return startOrder;
	}

	//--------------------------------------------------------------------------------
	// Export the function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}

type Label = {
	id: string;
	name: string;
	color: string;
};
