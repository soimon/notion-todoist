import {ApiComment} from '@lib/todoist';
import {log, runLogged} from '@lib/utils/dev';
import {Uploader} from './files/uploader';
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

export function createNoteSyncer(props: ConfigProps) {
	async function prepare(
		{todoist, uploader}: Integrations,
		notionIdByTodoistId: Map<string, string>
	) {
		return {
			comments: todoist.getComments(),
			uploader,
			notionIdByTodoistId,
		};
	}
	type Preparation = Awaited<ReturnType<typeof prepare>>;

	async function stage(
		{comments, notionIdByTodoistId, uploader}: Preparation,
		integrations: MutationQueues
	) {
		const dtos = comments
			.map(transformToDTO(notionIdByTodoistId))
			.filter(filterIrrelevant);
		await save(dtos, integrations, uploader);
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
			file:
				comment.file_attachment?.resource_type !== 'website'
					? comment.file_attachment
					: undefined,
		});
	type DTO = ReturnType<ReturnType<typeof transformToDTO>>;

	const filterIrrelevant = ({content, parentNotionId}: DTO) => {
		const hasRelevantParent = parentNotionId !== undefined;
		const isNotASyncStamp = extractSyncStamp(content) === undefined;
		return hasRelevantParent && isNotASyncStamp;
	};

	//--------------------------------------------------------------------------------
	// Store in Notion
	//--------------------------------------------------------------------------------

	async function save(
		dtos: DTO[],
		{notion, todoist}: MutationQueues,
		uploader: Uploader
	) {
		for (const dto of dtos) {
			if (!dto.parentNotionId) continue;
			notion.flagTaskAsReviewable(dto.parentNotionId);

			// Try uploading

			let url: string | undefined;
			if (dto.file) {
				const file = dto.file;
				if (!uploader.supportsFile(file)) continue;
				url = await runLogged(
					() => uploader.upload(file),
					`Uploading ${file.file_name}...`,
					'📷'
				);
				if (!url) {
					console.log('❌ Upload failed');
					continue;
				}
			}

			// Append to Notion

			const firstLine = dto.content.trim().split('\n').shift();
			const title = firstLine ? firstLine : dto.file?.file_name ?? '';
			notion.appendTaskContent({
				id: dto.parentNotionId,
				date: dto.date,
				content:
					dto.content + (url ? `\n\n![${dto.file?.file_name}](${url})` : ''),
			});
			todoist.deleteComment(dto.id);
		}
	}

	//--------------------------------------------------------------------------------
	// Export the function
	//--------------------------------------------------------------------------------

	return {prepare, stage};
}
