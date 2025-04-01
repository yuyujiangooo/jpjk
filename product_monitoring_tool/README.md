# 产品监控工具

这是一个基于 Next.js 和 Supabase 构建的产品监控工具，用于监控竞品的变化，并使用通义千问模型进行分析。

## 功能特点

- 监控竞品网站的变化
- 使用通义千问模型分析变化内容
- 数据持久化存储在 Supabase 数据库中
- 美观的用户界面，支持响应式设计

## 技术栈

- **前端框架**: Next.js 14 (App Router)
- **UI 组件**: Shadcn UI
- **数据库**: Supabase (PostgreSQL)
- **AI 模型**: 通义千问
- **样式**: Tailwind CSS

## 安装与设置

### 1. 克隆仓库

```bash
git clone <repository-url>
cd product_monitoring_tool
```

### 2. 安装依赖

```bash
npm install
```

### 3. 设置 Supabase

1. 创建 [Supabase](https://supabase.com/) 账户并创建新项目
2. 在 Supabase 项目中，进入 SQL 编辑器，运行 `lib/supabase-schema.sql` 中的 SQL 语句创建所需的表
3. 在项目根目录创建 `.env.local` 文件，添加以下环境变量：

```
QIANWEN_API_KEY=your_qianwen_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. 启动开发服务器

```bash
npm run dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 运行。

## 数据库结构

项目使用 Supabase (PostgreSQL) 作为数据库，包含以下表：

### monitoring_items (监控项)

存储要监控的产品信息：

- `id`: UUID (主键)
- `name`: 监控项名称
- `url`: 监控的网址
- `vendor`: 供应商/厂商名称
- `modules`: 要监控的模块列表
- `frequency`: 监控频率
- `status`: 监控状态
- `last_monitor_time`: 最后监控时间
- `is_monitoring`: 是否正在监控
- `created_at`: 创建时间
- `updated_at`: 更新时间

### monitoring_records (监控记录)

存储每次监控的记录：

- `id`: UUID (主键)
- `item_id`: 关联的监控项 ID
- `rank`: 排序序号
- `date`: 监控日期
- `status`: 监控状态
- `old_content`: 旧内容
- `new_content`: 新内容
- `created_at`: 创建时间
- `updated_at`: 更新时间

### monitoring_details (监控详情)

存储监控的详细信息：

- `id`: UUID (主键)
- `item_id`: 关联的监控项 ID
- `rank`: 排序序号
- `page`: 页面名称
- `link`: 页面链接
- `old_content`: 旧内容
- `new_content`: 新内容
- `action`: 操作类型（变化、新增、删除、警告等）
- `created_at`: 创建时间
- `updated_at`: 更新时间

## 使用方法

1. 访问首页，点击"创建监控项"按钮
2. 填写监控项信息，包括名称、URL、供应商和要监控的模块
3. 创建后，可以在监控项列表中查看所有监控项
4. 点击"开始监控"按钮开始监控
5. 监控结果将显示在监控项详情页面

## 通义千问集成

本项目使用通义千问模型进行竞品分析，主要用于：

1. 比较前后两次监控结果的差异
2. 分析变化内容的重要性
3. 提供变化内容的摘要和建议

## 贡献指南

欢迎提交 Pull Request 或创建 Issue 来改进这个项目。

## 许可证

[MIT](LICENSE) 