# Epics

### EP1 Project management

### EP1 Project management

### EP2 Observability

From the observability audit of 2026-10-24. Today a failure that isn't a sync error reaches only
Vercel's function logs: about 30 `console.error` calls (inference, the Slack digest, billing,
delivery, setting up a repository, PR comments, pending saves, Ask) leave no record a person can
see, there is no `handleError` hook or error page, and the daily cron's result exists only in its
HTTP response. The admin overview counts tenants and nothing else. These items make Project Magic
show its own health in the app, so a support engineer learns of a problem from a screen or a
message, with the evidence beside it, before a user reports it. Admin views keep the platform rule
(specs/tenants.md): tenants' metadata, never their content.
