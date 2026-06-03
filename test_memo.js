import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mnvbzpimsamgghlmesay.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udmJ6cGltc2FtZ2dobG1lc2F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI2OTAxOCwiZXhwIjoyMDg5ODQ1MDE4fQ.ki_vg1PDI6iptLr4S5b5QkD-vpXR1nW3UB7GGFM-088'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testMemo() {
  const { data: stores, error } = await supabase.from('stores').select('id').limit(1)
  if (stores && stores.length > 0) {
    const storeId = stores[0].id
    
    // Simulate updating memo
    const { data: updateData, error: updateError } = await supabase.from('stores').update({ memo: JSON.stringify({ test: 'memo' }) }).eq('id', storeId).select()
    
    console.log('Update Result:', JSON.stringify(updateData))
    if (updateError) {
      console.log('Update Error:', updateError.message)
    }
  } else {
    console.log("No stores", error)
  }
}

testMemo()
