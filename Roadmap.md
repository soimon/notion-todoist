# Notion <-> Todoist sync

## Overview

This is a simple script that syncs tasks from a Notion database to a Todoist project. It is intended to be run as a cron job (in case of Notion changes, because it has no webhooks) and in response to Todoist webhooks (in case of Todoist changes).

## Project breakdown

### Determining which tasks to sync
- [x] Get tasks from a Notion database
  - [x] Query the API
  - [ ] Turn into a generic DTO
- [ ] Get tasks from a Todoist project
  - [ ] Query the API
  - [ ] Turn into a generic DTO
- [ ] Compare the two lists
  - [ ] Mark changes
  - [ ] Determine which way to sync using timestamps
- [ ] Sync the two lists

### Syncing tasks
- [ ] Sync tasks from Notion to Todoist
  - [ ] Create new tasks
  - [ ] Update existing tasks
  - [ ] Delete tasks
- [ ] Sync tasks from Todoist to Notion
  - [ ] Create new tasks
  - [ ] Update existing tasks
  - [ ] Delete tasks

### Projects and goals
...