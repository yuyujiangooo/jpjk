#!/usr/bin/env node

// 检查 Supabase 连接的脚本
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// 获取 Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少 Supabase 配置。请确保 .env.local 文件中包含以下变量:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConnection() {
  console.log('正在检查 Supabase 连接...');
  
  try {
    // 尝试查询 monitoring_items 表
    const { data, error } = await supabase
      .from('monitoring_items')
      .select('id')
      .limit(1);
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Supabase 连接成功!');
    console.log(`已找到 ${data.length} 条监控项记录。`);
    
    // 检查其他表
    const tables = ['monitoring_records', 'monitoring_details'];
    for (const table of tables) {
      const { error: tableError } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      if (tableError) {
        console.warn(`⚠️ 警告: 无法查询 ${table} 表: ${tableError.message}`);
        console.warn('请确保已运行 lib/supabase-schema.sql 中的 SQL 语句创建所需的表。');
      } else {
        console.log(`✅ 表 ${table} 存在且可访问。`);
      }
    }
    
    console.log('\n数据库连接检查完成。');
  } catch (error) {
    console.error('❌ Supabase 连接失败:');
    console.error(error.message);
    
    if (error.message.includes('authentication')) {
      console.error('\n可能的原因:');
      console.error('1. Supabase URL 或 API 密钥不正确');
      console.error('2. 项目可能已暂停或删除');
    } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.error('\n表不存在。请确保已运行 lib/supabase-schema.sql 中的 SQL 语句创建所需的表。');
    }
    
    process.exit(1);
  }
}

checkConnection(); 