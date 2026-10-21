-- PM39: a daily digest of what waits on a person, posted to a Slack incoming webhook. The webhook
-- URL is a secret, so it is kept encrypted like a refresh token. The origin is the address the
-- admin used when they set it, for links in the digest. `digest_sent_on` stops a retried cron from
-- posting twice in a day.
alter table tenant_setting
	add column slack_webhook_enc text,
	add column digest_origin text,
	add column digest_sent_on date;
