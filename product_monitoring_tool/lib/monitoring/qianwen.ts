import axios from 'axios';
import type { MonitoringDetail } from "@/lib/monitoring";

// 通义千问API配置
interface QianwenConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

// 默认配置
const defaultConfig: QianwenConfig = {
  apiKey: 'sk-96807c7e95144f15ac8c0c8cd7e96a49', // 使用提供的API密钥
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
  model: 'qwen-max-latest', // 使用最新的模型名称
};

/**
 * 调用通义千问API分析内容变化
 * @param old_content 旧内容
 * @param new_content 新内容
 * @param config 可选的API配置
 * @returns 分析结果
 */
export async function analyzeContentChanges(
  old_content: string,
  new_content: string,
  config: Partial<QianwenConfig> = {}
): Promise<{
  summary: string;
  changes: {
    area: string;
    content: string;
    reason: string;
    suggestion: string;
  }[];
  hasSignificantChanges: boolean;
}> {
  // 合并配置
  const mergedConfig = { ...defaultConfig, ...config };
  
  if (!mergedConfig.apiKey) {
    throw new Error('通义千问API密钥未配置');
  }
  
  try {
    // 准备请求体
    const prompt = `你是一个竞品对标专家，可以精准追踪竞品内容变化的区域。通过比较竞品内容变化，分析竞品的功能迭代与运营策略。

**任务说明：**
以下是一个用于记录变化区域的模板。每个变化区域包含三个部分：**变化内容**、**变化原因** 和 **建议**。请根据实际情况动态生成变化区域的内容，并在最后添加一个**总结**部分。

**模板结构：**
- **变化区域**：[具体变化区域]
  - **变化内容**：[具体描述变化内容]
  - **变化原因**：[具体描述变化原因]
  - **建议**：[具体描述给本品的建议]
- **总结**：

**要求：**
1. 根据实际情况动态生成变化区域的内容，数量不固定。
2. 列举的变化要全面简明，可以直截了当地提醒相关人员
3. 尽量简短，字数控制在300字以内。
4. 在最后添加一个总结部分，对所有变化区域进行简要总结。
5. 若内容未发生变化，则直接输出"未变化"。

请分析以下两段文本之间的差异：

旧文本:
"""
${old_content}
"""

新文本:
"""
${new_content}
"""

请以JSON格式返回分析结果，包含以下字段：
1. summary: 变化的总体摘要描述
2. changes: 变化区域列表，每项包含:
   - area: 变化区域
   - content: 变化内容
   - reason: 变化原因
   - suggestion: 建议
3. hasSignificantChanges: 是否包含重要变化（布尔值）

只返回JSON格式的结果，不要有其他文字。
`;

    console.log('正在调用通义千问API分析内容变化...');
    
    // 发送请求到通义千问API
    const response = await axios.post(
      mergedConfig.apiUrl,
      {
        model: mergedConfig.model,
        input: {
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        parameters: {
          result_format: 'json',
          temperature: 0.3, // 降低温度以获得更确定性的结果
          top_p: 0.8,
          max_tokens: 2000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mergedConfig.apiKey}`,
          'X-DashScope-SSE': 'disable' // 禁用SSE流式响应
        },
        timeout: 30000, // 30秒超时
        validateStatus: (status) => status >= 200 && status < 300, // 只接受 2xx 状态码
      }
    );

    console.log('通义千问API响应状态:', response.status);
    
    // 解析响应
    if (!response.data || !response.data.output) {
      console.error('通义千问API响应格式异常:', JSON.stringify(response.data));
      throw new Error('API响应格式异常');
    }
    
    let result = '';
    if (response.data.output.text) {
      // 文本生成API格式
      result = response.data.output.text;
    } else if (response.data.output.choices && 
        response.data.output.choices[0] && 
        response.data.output.choices[0].message) {
      // 聊天API格式
      result = response.data.output.choices[0].message.content;
    } else {
      console.error('未知的API响应格式:', JSON.stringify(response.data));
      throw new Error('未知的API响应格式');
    }
    
    try {
      // 尝试解析JSON响应
      return JSON.parse(result);
    } catch (parseError) {
      console.error('解析通义千问响应失败:', parseError);
      console.error('原始响应内容:', result);
      
      // 检查是否收到了 HTML 响应
      if (result.includes('<!DOCTYPE') || result.includes('<html')) {
        console.error('收到了 HTML 响应而不是 JSON，可能是 API 服务器错误或网络问题');
        return {
          summary: '收到了非 JSON 格式的响应，可能是 API 服务器错误或网络问题',
          changes: [],
          hasSignificantChanges: false
        };
      }
      
      // 尝试提取可能的JSON部分
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedJson = jsonMatch[0];
          console.log('尝试提取JSON部分:', extractedJson);
          return JSON.parse(extractedJson);
        }
      } catch (extractError) {
        console.error('尝试提取JSON失败:', extractError);
      }
      
      // 返回默认结果
      return {
        summary: '无法解析通义千问的响应',
        changes: [],
        hasSignificantChanges: false
      };
    }
  } catch (error) {
    console.error('调用通义千问API失败:', error);
    
    // 详细记录错误信息
    if (axios.isAxiosError(error)) {
      console.error('API请求错误详情:');
      console.error('- 状态码:', error.response?.status);
      console.error('- 响应数据:', JSON.stringify(error.response?.data));
      console.error('- 请求配置:', JSON.stringify(error.config));
      
      // 检查是否收到了 HTML 响应
      if (typeof error.response?.data === 'string' && 
          (error.response.data.includes('<!DOCTYPE') || error.response.data.includes('<html'))) {
        console.error('收到了 HTML 响应而不是 JSON，可能是 API 服务器错误或网络问题');
        return {
          summary: '收到了非 JSON 格式的响应，可能是 API 服务器错误或网络问题',
          changes: [],
          hasSignificantChanges: false
        };
      }
    }
    
    // 返回错误结果
    return {
      summary: `调用通义千问API失败: ${error instanceof Error ? error.message : String(error)}`,
      changes: [],
      hasSignificantChanges: false
    };
  }
}

/**
 * 使用通义千问增强比较两次监控结果，找出变化
 * @param oldDetails 旧的监控详情
 * @param newDetails 新的监控详情
 * @returns 包含变化的监控详情
 */
export async function compareResultsWithQianwen(
  oldDetails: MonitoringDetail[],
  newDetails: MonitoringDetail[]
): Promise<{ changes: MonitoringDetail[]; recordSummary: string }> {
  const changes: MonitoringDetail[] = [];
  let hasChanges = false;
  let newPagesCount = 0;
  let deletedPagesCount = 0;
  
  // 遍历新的监控详情
  for (const newDetail of newDetails) {
    // 查找对应的旧详情
    const oldDetail = oldDetails.find(d => d.page === newDetail.page);
    
    // 如果找到旧详情，比较内容
    if (oldDetail) {
      // 首先进行简单的文本比较
      const hasContentChanged = oldDetail.new_content !== newDetail.new_content;
      
      if (hasContentChanged) {
        hasChanges = true;
        // 只有在内容确实发生变化时，才使用通义千问进行分析
        try {
          // 使用通义千问分析内容变化
          const analysis = await analyzeContentChanges(
            oldDetail.new_content,
            newDetail.new_content
          );
          
          // 检查分析结果是否有效
          if (!analysis || !analysis.summary) {
            throw new Error('通义千问返回的分析结果无效');
          }
          
          // 格式化分析结果为Markdown
          let formattedAnalysis = "**竞品分析结果**：\n\n";
          
          // 添加变化区域
          if (analysis.changes && analysis.changes.length > 0) {
            analysis.changes.forEach((change, index) => {
              formattedAnalysis += `### 变化区域 ${index + 1}：${change.area}\n`;
              formattedAnalysis += `- **变化内容**：${change.content}\n`;
              formattedAnalysis += `- **变化原因**：${change.reason}\n`;
              formattedAnalysis += `- **建议**：${change.suggestion}\n\n`;
            });
          }
          
          // 添加总结
          formattedAnalysis += `### 总结\n${analysis.summary}`;
          
          // 如果是重要变化，在总结中标注
          if (analysis.hasSignificantChanges) {
            formattedAnalysis += '\n\n**⚠️ 注意：这是一个重要变化**';
          }
          
          // 添加到变化列表，将分析结果放在 analysis_result 字段中
          changes.push({
            ...newDetail,
            old_content: oldDetail.new_content,
            new_content: newDetail.new_content,
            analysis_result: formattedAnalysis,
            action: "内容变化"
          });
        } catch (error) {
          console.error(`使用通义千问分析页面 ${newDetail.page} 的变化时出错:`, error);
          
          // 出错时使用默认比较方式
          changes.push({
            ...newDetail,
            old_content: oldDetail.new_content,
            new_content: newDetail.new_content,
            analysis_result: `**分析失败**：无法使用通义千问分析内容变化，请手动比较。\n错误信息：${error instanceof Error ? error.message : String(error)}`,
            action: "内容变化"
          });
        }
      } else {
        // 内容没有变化，保留但标记为无变化
        changes.push({
          ...newDetail,
          old_content: oldDetail.new_content,
          new_content: newDetail.new_content,
          analysis_result: "**分析结果**：未发现变化",
          action: "无变化"
        });
      }
    } else {
      // 新增的页面，标记为内容变化
      newPagesCount++;
      hasChanges = true;
      changes.push({
        ...newDetail,
        new_content: newDetail.new_content,
        analysis_result: "**分析结果**：新增页面",
        action: "内容变化"
      });
    }
  }
  
  // 查找删除的页面
  for (const oldDetail of oldDetails) {
    const stillExists = newDetails.some(d => d.page === oldDetail.page);
    if (!stillExists) {
      deletedPagesCount++;
      hasChanges = true;
      changes.push({
        ...oldDetail,
        new_content: "",
        analysis_result: "**分析结果**：页面已删除",
        action: "内容变化"
      });
    }
  }
  
  // 生成监控记录摘要
  let recordSummary = "未发现变化";
  if (hasChanges) {
    const summaryParts = [];
    if (newPagesCount > 0) {
      summaryParts.push(`新增${newPagesCount}个页面`);
    }
    if (deletedPagesCount > 0) {
      summaryParts.push(`删除${deletedPagesCount}个页面`);
    }
    const contentChanges = changes.filter(d => d.action === "内容变化" && !d.new_content.includes("页面已删除") && !d.analysis_result?.includes("新增页面")).length;
    if (contentChanges > 0) {
      summaryParts.push(`${contentChanges}处内容变化`);
    }
    recordSummary = summaryParts.join("，");
  }
  
  return { changes, recordSummary };
}

/**
 * 测试通义千问API连接
 * @returns 测试结果
 */
export async function testQianwenConnection(): Promise<{
  success: boolean;
  message: string;
  model?: string;
}> {
  try {
    console.log('测试通义千问API连接...');
    
    // 简单的测试提示
    const testPrompt = "请用一句话介绍通义千问大模型。只返回一句话，不要有其他内容。";
    
    // 发送请求到通义千问API
    const response = await axios.post(
      defaultConfig.apiUrl,
      {
        model: defaultConfig.model,
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
          'Authorization': `Bearer ${defaultConfig.apiKey}`,
          'X-DashScope-SSE': 'disable'
        },
        timeout: 30000, // 30秒超时
        validateStatus: (status) => status >= 200 && status < 300, // 只接受 2xx 状态码
      }
    );
    
    console.log('API响应数据:', JSON.stringify(response.data, null, 2));
    
    // 检查是否收到了 HTML 响应
    if (typeof response.data === 'string' && 
        (response.data.includes('<!DOCTYPE') || response.data.includes('<html'))) {
      console.error('收到了 HTML 响应而不是 JSON，可能是 API 服务器错误或网络问题');
      return {
        success: false,
        message: '收到了非 JSON 格式的响应，可能是 API 服务器错误或网络问题'
      };
    }
    
    if (response.status === 200 && response.data && response.data.output) {
      // 检查响应格式
      if (response.data.output.text) {
        // 文本生成API格式
        const content = response.data.output.text;
        const model = response.data.model || defaultConfig.model;
        
        return {
          success: true,
          message: `API连接成功，模型响应: "${content}"`,
          model
        };
      } else if (response.data.output.choices && response.data.output.choices[0] && response.data.output.choices[0].message) {
        // 聊天API格式
        const content = response.data.output.choices[0].message.content;
        const model = response.data.model || defaultConfig.model;
        
        return {
          success: true,
          message: `API连接成功，模型响应: "${content}"`,
          model
        };
      } else {
        console.error('未知的API响应格式:', JSON.stringify(response.data));
        return {
          success: false,
          message: `未知的API响应格式: ${JSON.stringify(response.data.output)}`
        };
      }
    } else {
      return {
        success: false,
        message: `API响应异常: ${JSON.stringify(response.data)}`
      };
    }
  } catch (error) {
    console.error('测试通义千问API连接失败:', error);
    
    if (axios.isAxiosError(error)) {
      console.error('API请求错误详情:');
      console.error('- 状态码:', error.response?.status);
      console.error('- 响应数据:', JSON.stringify(error.response?.data));
      console.error('- 请求配置:', JSON.stringify(error.config));
      
      // 检查是否收到了 HTML 响应
      if (typeof error.response?.data === 'string' && 
          (error.response.data.includes('<!DOCTYPE') || error.response.data.includes('<html'))) {
        return {
          success: false,
          message: '收到了 HTML 响应而不是 JSON，可能是 API 服务器错误或网络问题'
        };
      }
      
      return {
        success: false,
        message: `API连接失败: ${error.message}, 状态码: ${error.response?.status}, 响应: ${JSON.stringify(error.response?.data)}`
      };
    }
    
    return {
      success: false,
      message: `API连接失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 