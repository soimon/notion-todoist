# TODO

## Essential
[x] Get all projects/tasks from Notion that should be visible
[x] Structure the results in a tree
[x] Get all projects/tasks from Todoist and find out their sync ids
[x] Couple those todoist tasks with Notion again
[x] If todoist has a notion id that doesn't exist, delete it
[x] If todoist has no notion id, give it one by creating it in Notion
[x] Implement incremental sync in a different instance of Todoist (for checking items)
[x] Completion in todoist should be reflected in Notion
[x] Move all the loading to upfront
[x] Create a mutations class for both Todoist and Notion, and move logging to there as well
[x] Parse "Waiting for" to get a due date from it
[x] Update that due date in Todoist
[x] Make the due date part of the hash in Todoist
[x] Update the due date in Notion when it changes in Todoist (by prepending it to "Waiting for", or by replacing the existing date in there)
[x] Recurring due dates (they should be ignored, probably with a "recurring" property)
[x] Deploy

## Extras
[x] Make sure that no duplicate entries are made for the same task with multiple areas
[x] Links in titles should be converted to links in Todoist
[x] Determine the area property from the top-level parent project in Notion (pick one)
[x] Update that field in Notion where necessary
[x] When editing names with links in Todoist, make sure that the links are not removed
[ ] For newly created tasks in Todoist, give them a 5 minute cooldown window to be edited before synced (only implement this if it turns out the be bothersome in practice)
[ ] What happens if a task is completed in Todoist when this is running? Will it be caught by the incremental sync?
[ ] Add a link to the Todoist task in Notion