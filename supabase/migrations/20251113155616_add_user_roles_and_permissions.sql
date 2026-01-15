/*
  # Add User Roles and Permissions System

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `role` (text, default 'viewer')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Set default role as 'viewer' for new signups
    - Only the first user gets 'admin' role automatically
    - Admin users can manage cameras, servers, models
    - Viewer users can only view monitoring and events

  3. Security
    - Enable RLS on `user_profiles` table
    - Users can read their own profile
    - Only admins can update user roles
    - Automatic profile creation on signup via trigger
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile (for trigger)
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: Only admins can update roles
CREATE POLICY "Admins can update user roles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_count integer;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  
  -- Insert new profile
  -- First user gets admin role, all others get viewer role
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'viewer' END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update existing users if any (make them admin)
DO $$
BEGIN
  INSERT INTO user_profiles (id, email, role)
  SELECT id, email, 'admin'
  FROM auth.users
  WHERE id NOT IN (SELECT id FROM user_profiles);
END $$;
