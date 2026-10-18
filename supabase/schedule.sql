-- Run only after configuring the backend and approving provider usage.
-- Enable pg_cron and pg_net in Supabase, and create Vault secrets named
-- travel_project_url (https://PROJECT.supabase.co) and travel_cron_secret.
-- Set the same travel_cron_secret as CRON_SECRET on the monitor function.
-- Do not commit actual secret values. No provider key belongs in this SQL file.
select cron.schedule('wayfarer-price-monitor','0 */12 * * *', $$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='travel_project_url') || '/functions/v1/monitor',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='travel_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$$);
-- Inspect net._http_response for errors; a partial failure returns HTTP 207.
-- Disable: select cron.unschedule('wayfarer-price-monitor');
