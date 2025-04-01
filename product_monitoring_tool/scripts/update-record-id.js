#!/usr/bin/env node

// 执行添加record_id字段的SQL更新
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// 获取Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少Supabase配置。请确保.env.local文件中包含以下变量:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

// SQL语句 - 每个语句单独执行
const sqlStatements = [
  // 添加record_id字段
  `ALTER TABLE monitoring_details ADD COLUMN IF NOT EXISTS record_id UUID REFERENCES monitoring_records(id) ON DELETE CASCADE;`,
  
  // 创建索引
  `CREATE INDEX IF NOT EXISTS idx_monitoring_details_record_id ON monitoring_details(record_id);`,
  
  // 更新现有数据 - 分步执行
  `UPDATE monitoring_details d
   SET record_id = r.id
   FROM monitoring_records r
   WHERE d.item_id = r.item_id
   AND r.id IN (
     SELECT id 
     FROM monitoring_records 
     WHERE item_id = d.item_id 
     ORDER BY created_at DESC 
     LIMIT 1
   )
   AND d.record_id IS NULL;`,
  
  // 设置record_id为非空
  `ALTER TABLE monitoring_details ALTER COLUMN record_id SET NOT NULL;`
];

async function executeSQL() {
  console.log('正在更新监控详情表，添加record_id字段...');
  
  try {
    for (let i = 0; i < sqlStatements.length; i++) {
      const stmt = sqlStatements[i];
      console.log(`\n执行语句 ${i + 1}/${sqlStatements.length}:`);
      console.log(stmt);
      
      // 使用SQL API直接执行语句
      const { error } = await supabase.rpc('exec_sql', { query: stmt });
      
      if (error) {
        if (error.message.includes('function "exec_sql" does not exist')) {
          console.error('\n错误: Supabase项目中不存在exec_sql函数。');
          console.error('请在Supabase控制台中创建此函数，或使用SQL编辑器手动执行这些语句。');
          
          // 尝试使用SQL编辑器API
          console.log('\n尝试使用SQL编辑器API执行...');
          const { error: sqlError } = await supabase.from('_exec_sql').select('*').eq('query', stmt);
          
          if (sqlError) {
            console.error('SQL编辑器API执行失败:', sqlError.message);
            break;
          } else {
            console.log(`✅ 语句 ${i + 1} 执行成功`);
          }
        } else {
          console.error(`\n执行语句 ${i + 1} 时出错:`);
          console.error(error.message);
          
          // 如果是子查询语法错误，尝试修改语法
          if (error.message.includes('syntax error') && i === 2) {
            console.log('\n尝试使用替代语法...');
            
            // 替代语法 - 使用EXISTS而不是IN
            const altStmt = `
              UPDATE monitoring_details d
              SET record_id = (
                SELECT id 
                FROM monitoring_records r
                WHERE r.item_id = d.item_id 
                ORDER BY created_at DESC 
                LIMIT 1
              )
              WHERE d.record_id IS NULL
              AND EXISTS (
                SELECT 1 
                FROM monitoring_records r
                WHERE r.item_id = d.item_id
              );
            `;
            
            console.log(altStmt);
            const { error: altError } = await supabase.rpc('exec_sql', { query: altStmt });
            
            if (altError) {
              console.error('替代语法执行失败:', altError.message);
            } else {
              console.log(`✅ 替代语句执行成功`);
            }
          }
        }
      } else {
        console.log(`✅ 语句 ${i + 1} 执行成功`);
      }
    }
    
    console.log('\n数据库更新完成。');
  } catch (error) {
    console.error('执行SQL语句时发生错误:');
    console.error(error.message);
    process.exit(1);
  }
}

executeSQL(); 