-- Set reyzostyle@gmail.com to PRO plan
UPDATE user_tokens
SET plan = 'agency'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'reyzostyle@gmail.com'
);
