import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mnvbzpimsamgghlmesay.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udmJ6cGltc2FtZ2dobG1lc2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI2OTAxOCwiZXhwIjoyMDg5ODQ1MDE4fQ.ki_vg1PDI6iptLr4S5b5QkD-vpXR1nW3UB7GGFM-088'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: storeMembers, error: err1 } = await supabase.from('store_members').select('*')
  console.log('--- STORE MEMBERS ---')
  console.log(storeMembers, err1)

  const { data: profiles, error: err2 } = await supabase.from('profiles').select('*')
  console.log('--- PROFILES ---')
  console.log(profiles, err2)

  const { data: stores, error: err3 } = await supabase.from('stores').select('*')
  console.log('--- STORES ---')
  console.log(stores, err3)

  // Try the exact query from the client
  if (profiles && profiles.length > 0) {
    const userId = profiles[0].id
    const { data: joinData, error: joinErr } = await supabase
      .from('store_members')
      .select('*, stores(*)')
      .eq('user_id', userId)
    console.log('--- JOIN DATA for user', userId, '---')
    console.log(joinData, joinErr)
  }
}

run()
