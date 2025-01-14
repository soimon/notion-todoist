import {
	extractHashFromLink,
	extractIdFromLink,
	generateLink,
} from '@lib/notion';
import {ApiTask} from '@lib/todoist';
import {makeIsoScheduledString} from '@lib/utils/time';
import md5 from 'md5';

const LINK_TEXT = 'Open in Notion';

export const stampToLink = (stamp: SyncStamp) =>
	`[${LINK_TEXT}](${generateLink(stamp.notionId)}#${stamp.hash})`;

export const generateContentHash = (
	task: Pick<ApiTask, 'content' | 'labels'> & {date?: Date; deadline?: Date}
) =>
	md5(
		`${task.content}-${task.labels.sort().join()}-${
			task.date ? makeIsoScheduledString(task.date, false) : 'no_date'
		}-${
			task.deadline
				? makeIsoScheduledString(task.deadline, false)
				: 'no_deadline'
		}`
	);

export const extractSyncStamp = (text: string): SyncStamp | undefined => {
	const match = text.match(new RegExp(`^\\[${LINK_TEXT}\\]\\((.*)\\)`));
	if (!match) return;
	const notionId = extractIdFromLink(match[1]);
	const hash = extractHashFromLink(match[1]);
	if (!notionId || !hash) return;
	return {
		notionId,
		hash,
	};
};

export type SyncStamp = {
	notionId: string;
	hash: string;
};
