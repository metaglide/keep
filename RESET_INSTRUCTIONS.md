# Reset Instructions

This repository should be reset to commit 55aa2ae6bbcc42ae660369a0fea98d2ceced0ee1 (fix: flickering provider icons #4144).

## Files to Remove

The following files related to the user tagging feature should be removed:

1. `docs/features/user-tagging.mdx`
2. `docs/workflows/examples/user-mention-workflow.mdx`
3. `examples/workflows/auto-assign-on-mention.yaml`
4. `examples/workflows/user-mention-notification.yaml`
5. `keep/api/models/db/comment_mention.py`

## Files to Modify

The following files need to be modified to remove user tagging functionality:

1. `keep/api/models/workflow_trigger_types.py` - Remove USER_ASSIGNED trigger type
2. `keep/api/routes/incidents.py` - Remove CommentMention import and related code
3. `keep/workflowmanager/workflowmanager.py` - Remove insert_user_assigned_event method and related code
4. `keep-ui/features/workflows/builder/lib/utils.tsx` - Remove user_assigned from trigger types
5. `keep-ui/app/(keep)/incidents/[id]/activity/ui/IncidentActivityItem.tsx` - Remove @mention handling
6. `docs/workflows/syntax/triggers.mdx` - Remove user_assigned trigger type documentation

## Instructions

To reset the repository to the specified commit:

```bash
git reset --hard 55aa2ae6bbcc42ae660369a0fea98d2ceced0ee1
git push -f origin main
```

This will remove all changes related to the user tagging feature and reset the codebase to the state before that feature was implemented.