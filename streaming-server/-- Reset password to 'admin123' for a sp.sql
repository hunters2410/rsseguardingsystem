-- Reset password to 'admin123' for a specific user
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf'))
WHERE email = 'admin@ght.co.zw';

-- IMPORTANT: Also confirm the email so you don't get 'Email not confirmed' errors
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'admin@ght.co.zw';



-- 1. Promote the user profile to Admin
UPDATE public.user_profiles 
SET role = 'admin' 
WHERE email = 'admin@ght.co.zw';

-- 2. Ensure this email is set as the system administrator for alerts
-- Note: 'id' might be needed if you haven't inserted settings yet. 
-- This assumes a single settings row exists or creates the first one.
INSERT INTO public.system_settings (admin_email, company_name, alert_email_enabled)
VALUES ('admin@ght.co.zw', 'Real Star Security', true)
ON CONFLICT (id) DO UPDATE SET admin_email = EXCLUDED.admin_email;

-- 3. Verify the changes
SELECT email, role FROM public.user_profiles WHERE email = 'admin@ght.co.zw';
