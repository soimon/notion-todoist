import {defineSchema} from '@lib/notion';
import {ApiComment} from '@lib/todoist';
import {log} from '@lib/utils/dev';
import {Integrations} from './integrations';
import {MutationQueues} from './mutating';
import {NoteSchema} from './mutating/notion';
import {extractSyncStamp} from './syncstamp';

export type ConfigProps = {
	schema: NoteSchema;
};

//
// The usefulness of this functionality is severely limited, because you can't
// upload files to Notion via the API. Parking it for now.
//

// TODO:
// - Mark comments as synced (can't give a reaction by API)

export function createNoteSyncer(props: ConfigProps) {
	async function prepare(
		{todoist}: Integrations,
		notionIdByTodoistId: Map<string, string>
	) {
		return {
			comments: todoist.getComments(),
			notionIdByTodoistId,
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	function stage(
		{comments, notionIdByTodoistId}: Preparation,
		integrations: MutationQueues
	) {
		const dtos = comments
			.map(transformToDTO(notionIdByTodoistId))
			.filter(filterIrrelevant);
		save(dtos, integrations);
		log('comments', dtos);
	}

	//--------------------------------------------------------------------------------
	// Mapping and filtering
	//--------------------------------------------------------------------------------

	const transformToDTO =
		(notionIdByTodoistId: Map<string, string>) => (comment: ApiComment) => ({
			id: comment.id,
			content: comment.content,
			parentId: comment.item_id,
			parentNotionId: notionIdByTodoistId.get(comment.item_id),
			date: new Date(comment.posted_at),
			reactions: Object.keys(comment.reactions ?? {}),
			file: comment.file_attachment,
		});
	type DTO = ReturnType<ReturnType<typeof transformToDTO>>;

	const filterIrrelevant = ({content, file, parentNotionId}: DTO) => {
		const hasRelevantParent = parentNotionId !== undefined;
		const noPendingFile = !file || file.upload_state !== 'pending';
		const isNotASyncStamp = extractSyncStamp(content) === undefined;
		return hasRelevantParent && noPendingFile && isNotASyncStamp;
	};

	//--------------------------------------------------------------------------------
	// Store in Notion
	//--------------------------------------------------------------------------------

	function save(dtos: DTO[], {notion, todoist}: MutationQueues) {
		dtos.forEach(dto => {
			if (!dto.parentNotionId) return;
			const firstLine = dto.content.trim().split('\n').shift();
			const title = firstLine ? firstLine : dto.file?.file_name ?? '';
			notion.appendTaskContent(dto.parentNotionId, dto.date, dto.content);
			todoist.deleteComment(dto.id);
		});
	}

	//--------------------------------------------------------------------------------
	// Types
	//--------------------------------------------------------------------------------

	const schema = defineSchema({
		Name: {type: 'title', id: 'title'},
		Files: {type: 'files', id: props.schema.fields.files},
		Date: {type: 'date', id: props.schema.fields.date},
	});

	//--------------------------------------------------------------------------------
	// Export the function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}
