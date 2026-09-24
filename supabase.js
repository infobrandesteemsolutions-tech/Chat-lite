// --- SHARED SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://qclfxoyxnihuttlemzmi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-jLY8uajMI_u_mxQHHUAsA_Q5d5FWVG';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
