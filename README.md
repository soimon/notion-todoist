# Notion - Todoist syncer

This is a scheduled script that syncs tasks and projects between Notion and Todoist.

## What does it sync?

### Bidirectional
- **📝 Tasks** are synced between Notion and Todoist.

### Only from Notion to Todoist
- **📂 Areas** are created as projects in Todoist.
- **🏷️ Verbs, locations, and people** are created as labels in Todoist.

### Only from Todoist to Notion
- **💬 Task comments** are dated and appended to pages in Notion. The comments are deleted from Todoist.

### Within Notion
- The `area` field of projects will be set to the area of the root parent.
- The `@ Is Scheduled` property will be set to true if the task has a due date. This helps with filtering in views.

## How does it sync?
It compares the entire tree of data in Notion with the entire tree of data in Todoist. It then creates, updates, and deletes tasks, projects, labels, and comments as needed.
### Hash comment
Projects/areas and tasks are matched by the first comment in the project/task in Todoist. This is how it decides on which side the information has changed:
- If there is no comment yet in Todoist, it means it is created in Todoist and will be created in Notion.
- If the hash in the comment does not match the data in Todoist (labels, content, due date, etc.), it means it is updated in Todoist and will be updated in Notion.
- If the hash in the comment matches the data in Todoist, it means it is updated in Notion and will be updated in Todoist.
## Special cases
### Completing tasks
To make sure not to lose any data, tasks are not deleted in Notion when they are completed in Todoist. Instead, they are marked as `To be reviewed` in Notion. In Todoist, they are removed.
### Recurring tasks
Todoist allows for recurring tasks. Notion does not. When a task is made recurring in Todoist, the title in Notion will be appended with 🔄. From that point on, the task will always be synced from Todoist to Notion.
### Postponed tasks
Postponed tasks are tasks with a `waiting for` in Todoist that are not reliant on a date. They need to be manually checked. Or, they have `later/maybe` as the verb.

To reduce clutter in Todoist, tasks like these (that are not helpful on a daily basis) get their name prefixed with ⏸, and all their labels removed. From that point on, the task will always be synced from Notion to Todoist until they are not postponed anymore.
## Current limitations
### Attachments in comments are ignored
Ideally, they would be added to the Notion page. This is currently impossible due to:
- Todoist API limitations (you can't easily access attachments without authorizing)
- Notion API limitations (you can't upload anything)
- External services like Google Drive and S3 are very hard to implement in a way that is user-friendly and secure.

To make sure not to lose any data, comments with attachments are completely ignored and won't be deleted. The status in Notion keeps being changed to `New notes` to tell the user that there are new notes in Todoist.
### You can't tag people from Todoist
This is because people are from a database in Notion. In order for this to work, the pages should be found by name.