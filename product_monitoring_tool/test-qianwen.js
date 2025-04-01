const axios = require('axios');

// 通义千问API配置
const config = {
  apiKey: 'sk-96807c7e95144f15ac8c0c8cd7e96a49',
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
  model: 'qwen-max-latest'
};

async function testQianwen() {
  try {
    console.log('测试通义千问API连接...');
    
    // 简单的测试提示
    const testPrompt = "请用一句话介绍通义千问大模型。只返回一句话，不要有其他内容。";
    
    // 发送请求到通义千问API
    const response = await axios.post(
      config.apiUrl,
      {
        model: config.model,
        input: {
          messages: [
            {
              role: 'user',
              content: testPrompt
            }
          ]
        },
        parameters: {
          max_tokens: 100
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-DashScope-SSE': 'disable'
        }
      }
    );
    
    console.log('API响应状态码:', response.status);
    console.log('API响应数据:', JSON.stringify(response.data, null, 2));
    
    // 检查响应格式
    if (response.data && response.data.output) {
      if (response.data.output.text) {
        // 文本生成API格式
        const content = response.data.output.text;
        console.log('模型响应 (text格式):', content);
        console.log('测试成功!');
      } else if (response.data.output.choices && response.data.output.choices[0] && response.data.output.choices[0].message) {
        // 聊天API格式
        const content = response.data.output.choices[0].message.content;
        console.log('模型响应 (chat格式):', content);
        console.log('测试成功!');
      } else {
        console.error('未知的API响应格式');
      }
    } else {
      console.error('API响应格式异常');
    }
  } catch (error) {
    console.error('测试失败:', error.message);
    
    if (error.response) {
      console.error('错误状态码:', error.response.status);
      console.error('错误响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
testQianwen(); 