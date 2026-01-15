-- Add Email (SMTP) and SMS configuration columns to system_settings
alter table system_settings 
add column if not exists smtp_host text,
add column if not exists smtp_port int,
add column if not exists smtp_user text,
add column if not exists smtp_pass text,
add column if not exists smtp_from text,
add column if not exists alert_sms_enabled boolean default false,
add column if not exists sms_provider text default 'twilio',
add column if not exists sms_account_sid text,
add column if not exists sms_auth_token text,
add column if not exists sms_from text;
