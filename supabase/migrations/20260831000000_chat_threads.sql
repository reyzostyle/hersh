-- Analysis becomes a conversation.
--
-- A run used to be a row in `analyses` and a modal that opened once. Now it
-- opens a thread: the request, the scored analysis as a reply, and any
-- follow-up questions after it. The thread is what gets saved and reopened,
-- so `analyses` stays exactly as it is and is referenced rather than replaced.

CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Taken from the video title when there is one, else the first thing typed.
  title text,
  -- The analysis this thread opened with. Null for a thread that never got
  -- one (a link that failed), which should still be reopenable.
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  -- Set only on the message carrying a scored analysis, so the thread can
  -- render that one as a result card and the rest as plain replies.
  analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own threads" ON chat_threads;
CREATE POLICY "Own threads" ON chat_threads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Own messages" ON chat_messages;
CREATE POLICY "Own messages" ON chat_messages FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role threads" ON chat_threads;
CREATE POLICY "Service role threads" ON chat_threads FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role messages" ON chat_messages;
CREATE POLICY "Service role messages" ON chat_messages FOR ALL USING (auth.role() = 'service_role');
