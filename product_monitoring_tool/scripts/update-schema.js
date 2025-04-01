#!/usr/bin/env node

// 执行 Supabase 数据库架构更新的脚本
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
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

// 读取 SQL 文件
const sqlFilePath = path.join(__dirname, '..', 'lib', 'supabase-schema-update.sql');
let sqlContent;

try {
  sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
} catch (error) {
  console.error(`错误: 无法读取 SQL 文件 ${sqlFilePath}:`);
  console.error(error.message);
  process.exit(1);
}

// 将 SQL 文件拆分为单独的语句
const sqlStatements = sqlContent
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0);

async function executeSQL() {
  console.log('正在更新 Supabase 数据库架构...');
  console.log(`找到 ${sqlStatements.length} 条 SQL 语句需要执行\n`);
  
  try {
    for (let i = 0; i < sqlStatements.length; i++) {
      const stmt = sqlStatements[i];
      console.log(`执行语句 ${i + 1}/${sqlStatements.length}:`);
      console.log(stmt);
      
      const { error } = await supabase.rpc('exec_sql', { query: stmt });
      
      if (error) {
        if (error.message.includes('function "exec_sql" does not exist')) {
          console.error('\n错误: Supabase 项目中不存在 exec_sql 函数。');
          console.error('请在 Supabase 控制台中创建此函数，或使用 SQL 编辑器手动执行这些语句。');
          break;
        } else {
          console.error(`\n执行语句 ${i + 1} 时出错:`);
          console.error(error.message);
        }
      } else {
        console.log(`✅ 语句 ${i + 1} 执行成功\n`);
      }
    }
    
    console.log('数据库架构更新完成。');
    console.log('请运行 npm run check-supabase 来验证更改。');
  } catch (error) {
    console.error('执行 SQL 语句时发生错误:');
    console.error(error.message);
    process.exit(1);
  }
}

executeSQL(); 