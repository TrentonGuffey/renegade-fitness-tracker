import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm'

const SUPABASE_URL = 'https://ksqsickcrkbemvducrge.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzcXNpY2tjcmtiZW12ZHVjcmdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODI3MjAsImV4cCI6MjA5ODE1ODcyMH0.pfi1Km4n88YIod4zVbBodg0yfAN8NWic7VKqn9so0Fs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
})