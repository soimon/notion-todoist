import {TodoistApi} from '@doist/todoist-api-typescript';
import {Client} from '@notionhq/client';
import dotenv from 'dotenv';
import {NotionTaskRepository} from './repositories/tasks-notion';
import {TodoistTaskRepository} from './repositories/todoist';
dotenv.config();

async function main() {
	// Create repositories

	const notion = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	const todoist = new TodoistApi(process.env.TODOIST_TOKEN);
	const todoistTasks = new TodoistTaskRepository(todoist);
	const notionTasks = new NotionTaskRepository(
		notion,
		process.env.NOTION_DB_TASKS
	);

	// Fetch notion tasks

	const tasks = await notionTasks.getOpenTasks();
	const changedTasks = tasks.filter(task => task.todoistId !== '0');
	const newTasks = tasks.filter(task => task.todoistId === '0');

	// Update tasks in Todoist

	for (const notionTask of changedTasks) {
		const wasFound = await todoistTasks.update(notionTask.todoistId, {
			content: notionTask.content,
			description: notionTask.projectName,
			isCompleted: notionTask.isCompleted,
			dueDate: notionTask.scheduled,
		});
		if (!wasFound) newTasks.push(notionTask);
	}

	// Create tasks in Todoist

	newTasks.forEach(async t => {
		const todoistId = await todoistTasks.add({
			content: t.content,
			description: t.projectName,
			dueDate: t.scheduled,
		});
		await notionTasks.linkWithTodoist(t.notionId, todoistId);
	});
}

main();
