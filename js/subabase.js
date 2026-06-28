import { createClient } from 'https//cdn.jsdelivr.net/npm/@supabse/supabase-js@2/+esm'

const SUPABASE_URL = 'https://ksqsickcrkbemvducrge.supabase.co/rest/v1/'   
const SUPABASE_KEY = 'sb_publishable_Gn_NxqVaN6Nb_88glMXrxA_U1ElUH3t'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)