-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 创建管理员用户表
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- 创建监控项表
CREATE TABLE IF NOT EXISTS monitoring_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    url TEXT NOT NULL,
    vendor VARCHAR(50) NOT NULL,
    modules TEXT[] NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    is_monitoring BOOLEAN DEFAULT false,
    last_check TIMESTAMP WITH TIME ZONE,
    next_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email_notification BOOLEAN DEFAULT false,
    email_recipients TEXT
);

-- 创建监控记录表
CREATE TABLE IF NOT EXISTS monitoring_records (
    id SERIAL PRIMARY KEY,
    monitoring_item_id INTEGER REFERENCES monitoring_items(id) ON DELETE CASCADE,
    check_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL,
    changes_detected BOOLEAN DEFAULT false,
    error_message TEXT,
    execution_time INTEGER -- 执行时间（毫秒）
);

-- 创建监控详情表
CREATE TABLE IF NOT EXISTS monitoring_details (
    id SERIAL PRIMARY KEY,
    record_id INTEGER REFERENCES monitoring_records(id) ON DELETE CASCADE,
    module_name VARCHAR(50) NOT NULL,
    old_content TEXT,
    new_content TEXT,
    diff_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建管理员用户相关函数
CREATE OR REPLACE FUNCTION create_admin_user(
    p_username VARCHAR,
    p_password VARCHAR
) RETURNS JSONB AS $$
DECLARE
    v_user_id INTEGER;
    v_result JSONB;
BEGIN
    INSERT INTO admin_users (username, password_hash)
    VALUES (p_username, crypt(p_password, gen_salt('bf')))
    RETURNING id INTO v_user_id;
    
    v_result := jsonb_build_object(
        'id', v_user_id,
        'username', p_username
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION verify_admin_login(
    p_username VARCHAR,
    p_password VARCHAR
) RETURNS JSONB AS $$
DECLARE
    v_user admin_users%ROWTYPE;
    v_result JSONB;
BEGIN
    -- 尝试查找用户
    SELECT *
    INTO v_user
    FROM admin_users
    WHERE username = p_username
    AND password_hash = crypt(p_password, password_hash);
    
    -- 如果找到用户，更新最后登录时间并返回用户信息
    IF FOUND THEN
        UPDATE admin_users
        SET last_login = CURRENT_TIMESTAMP
        WHERE id = v_user.id;
        
        v_result := jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'id', v_user.id,
                'username', v_user.username
            )
        );
    ELSE
        v_result := jsonb_build_object(
            'success', false,
            'error', '用户名或密码错误'
        );
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建监控记录限制函数
CREATE OR REPLACE FUNCTION limit_monitoring_records()
RETURNS TRIGGER AS $$
DECLARE
    max_records INTEGER := 5; -- 每个监控项保留的最大记录数
    excess_records INTEGER;
    item_id INTEGER;
BEGIN
    item_id := NEW.monitoring_item_id;
    
    -- 计算超出限制的记录数
    WITH record_count AS (
        SELECT COUNT(*) as cnt
        FROM monitoring_records
        WHERE monitoring_item_id = item_id
    )
    SELECT GREATEST(0, (SELECT cnt FROM record_count) - max_records + 1)
    INTO excess_records;
    
    -- 如果超出限制，删除最旧的记录
    IF excess_records > 0 THEN
        DELETE FROM monitoring_records
        WHERE id IN (
            SELECT id
            FROM monitoring_records
            WHERE monitoring_item_id = item_id
            ORDER BY check_time ASC
            LIMIT excess_records
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为监控项表添加更新时间触发器
CREATE TRIGGER update_monitoring_items_updated_at
    BEFORE UPDATE ON monitoring_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为监控记录表添加限制记录数触发器
CREATE TRIGGER trg_limit_monitoring_records
    AFTER INSERT ON monitoring_records
    FOR EACH ROW
    EXECUTE FUNCTION limit_monitoring_records();

-- 创建初始管理员用户（密码：admin123）
SELECT create_admin_user('admin', 'admin123'); 