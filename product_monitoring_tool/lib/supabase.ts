import { createClient } from '@supabase/supabase-js'

// 从环境变量中获取 Supabase URL 和 API 密钥
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'public'
  },
  auth: {
    persistSession: false // 禁用会话持久化，减少连接占用
  },
  global: {
    headers: {
      'x-connection-pool': 'true' // 添加连接池标识
    }
  }
})

export { supabase }

// 检查 Supabase 连接
export async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('monitoring_items').select('count', { count: 'exact' }).limit(1)
    
    if (error) {
      console.error('Supabase 连接错误:', error)
      return false
    }
    
    console.log('Supabase 连接成功')
    return true
  } catch (error) {
    console.error('Supabase 连接检查失败:', error)
    return false
  }
}
