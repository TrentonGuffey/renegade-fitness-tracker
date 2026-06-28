import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm'

const SUPABASE_URL = 'https://ksqsickcrkbemvducrge.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Gn_NxqVaN6Nb_88glMXrxA_U1ElUH3t'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
}) ent(SUPABASE_URL, SUPABASE_KEY)