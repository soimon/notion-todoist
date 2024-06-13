import {defineSchema} from '@lib/notion';
import {ApiComment} from '@lib/todoist';
import {log} from '@lib/utils/dev';
import {Integrations} from './integrations';
import {MutationQueues} from './mutating';
import {NoteSchema, NotionMutationQueue} from './mutating/notion';
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
	async function prepare({todoist}: Integrations) {
		return {
			comments: todoist.getComments(),
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	function stage({comments}: Preparation, {notion}: MutationQueues) {
		const dtos = comments.map(transformToDTO).filter(filterIrrelevant);
		saveToNotion(dtos, notion);
		log('comments', dtos);
	}

	//--------------------------------------------------------------------------------
	// Mapping and filtering
	//--------------------------------------------------------------------------------

	const transformToDTO = (comment: ApiComment) => ({
		id: comment.id,
		content: comment.content,
		parentId: comment.item_id,
		date: new Date(comment.posted_at),
		reactions: Object.keys(comment.reactions ?? {}),
		file: comment.file_attachment,
	});
	type DTO = ReturnType<typeof transformToDTO>;

	const filterIrrelevant = ({content, reactions, file, parentId}: DTO) => {
		const notSyncedYet = reactions.length === 0;
		const noPendingFile = !file || file.upload_state !== 'pending';
		const isNotASyncStamp = extractSyncStamp(content) === undefined;
		return (
			notSyncedYet &&
			noPendingFile &&
			isNotASyncStamp &&
			parentId === '8115125120'
		);
	};

	//--------------------------------------------------------------------------------
	// Store in Notion
	//--------------------------------------------------------------------------------

	function saveToNotion(dtos: DTO[], notion: NotionMutationQueue) {
		dtos.forEach(dto => {
			const firstLine = dto.content.trim().split('\n').shift();
			notion.createNote('', {
				title: firstLine ? firstLine : dto.file?.file_name ?? '',
				content: dto.content,
				date: dto.date,
				fileName: dto.file?.file_name,
				filePath: dto.file?.file_url,
			});
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
