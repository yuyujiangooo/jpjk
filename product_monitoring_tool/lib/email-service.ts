// 邮件发送服务
// 注意：这是一个示例实现，实际应用中需要使用真实的邮件服务如 Nodemailer、SendGrid 等

import nodemailer from 'nodemailer'
import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring"

// 创建邮件发送器
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
}

/**
 * 从监控详情中提取千问分析结果
 * @param detail 监控详情
 * @returns 格式化的分析结果HTML
 */
function extractAnalysisResult(detail: MonitoringDetail): string {
  if (!detail.new_content || !detail.new_content.includes('---')) {
    return ''
  }

  try {
    // 尝试提取分析结果部分
    const parts = detail.new_content.split('\n\n---\n\n')
    if (parts.length < 2) return ''

    const analysisMarkdown = parts[1]
    
    // 将Markdown格式转换为HTML
    const analysisHtml = analysisMarkdown
      .replace(/### (.*)/g, '<h4 style="margin-top:15px;margin-bottom:5px;color:#333;">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/- \*\*(.*?)\*\*:(.*)/g, '<div style="margin-left:15px;margin-bottom:5px;"><strong>$1:</strong>$2</div>')
      .replace(/- (.*)/g, '<div style="margin-left:15px;margin-bottom:5px;">$1</div>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')

    return analysisHtml
  } catch (error) {
    console.error('提取分析结果时出错:', error)
    return ''
  }
}

/**
 * 发送监控结果邮件
 * @param item 监控项
 * @param record 监控记录
 * @param details 监控详情
 * @returns 是否发送成功
 */
export async function sendMonitoringResultEmail(
  item: MonitoringItem,
  record: MonitoringRecord,
  details: MonitoringDetail[]
): Promise<boolean> {
  try {
    // 检查是否需要发送邮件
    if (!item.email_notification || !item.email_recipients || item.email_recipients.length === 0) {
      console.log(`监控项 ${item.name} 未启用邮件通知或未设置收件人`)
      return false
    }

    // 获取收件人列表
    const recipients = Array.isArray(item.email_recipients) 
      ? item.email_recipients 
      : [item.email_recipients]

    if (recipients.length === 0) {
      console.log(`监控项 ${item.name} 未设置有效的收件人`)
      return false
    }

    // 构建邮件内容
    const subject = `【产品监控通知】${item.name} - ${record.status}`
    
    // 邮件样式
    const emailStyles = `
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 800px; margin: 0 auto; padding: 20px; }
      .header { background-color: #f0f4f8; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      .details { margin-bottom: 20px; }
      .detail-item { background-color: #fff; border: 1px solid #e0e0e0; border-radius: 5px; padding: 15px; margin-bottom: 15px; }
      .detail-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
      .detail-content { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
      .content-box { background-color: #f5f5f5; padding: 10px; border-radius: 3px; max-height: 200px; overflow-y: auto; }
      .analysis { background-color: #edf7ff; padding: 15px; border-radius: 3px; margin-top: 10px; }
      .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
      .btn { display: inline-block; background-color: #3A48FB; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
      .tag { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; }
      .tag-change { background-color: #fff3cd; color: #856404; }
      .tag-new { background-color: #d4edda; color: #155724; }
      .tag-delete { background-color: #f8d7da; color: #721c24; }
      .tag-warning { background-color: #f8d7da; color: #721c24; }
    `
    
    // 邮件头部
    let content = `
      <html>
      <head>
        <style>${emailStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin:0;">产品监控结果通知</h2>
          </div>
          
          <div class="summary">
            <p><strong>监控项:</strong> ${item.name}</p>
            <p><strong>监控URL:</strong> <a href="${item.url}" target="_blank">${item.url}</a></p>
            <p><strong>监控时间:</strong> ${record.date}</p>
            <p><strong>监控状态:</strong> ${record.status}</p>
            <p><strong>监控结果:</strong> ${record.summary}</p>
          </div>
    `

    // 如果有变化，添加变化详情
    if (details && details.length > 0) {
      // 只显示有变化的详情
      const changedDetails = details.filter(detail => 
        ["变化", "新增", "删除", "警告"].includes(detail.action)
      )
      
      if (changedDetails.length > 0) {
        content += `<div class="details"><h3>变化详情:</h3>`
        
        changedDetails.forEach(detail => {
          // 根据action类型设置标签样式
          let tagClass = 'tag-change'
          let tagText = '内容变化'
          
          if (detail.action === "新增") {
            tagClass = 'tag-new'
            tagText = '新增页面'
          } else if (detail.action === "删除") {
            tagClass = 'tag-delete'
            tagText = '页面删除'
          } else if (detail.action === "警告") {
            tagClass = 'tag-warning'
            tagText = '重要变化'
          }
          
          // 提取实际内容和分析结果
          let actualContent = detail.new_content
          if (actualContent && actualContent.includes('---')) {
            actualContent = detail.new_content.split('\n\n---\n\n')[0]
          }
          
          // 提取分析结果
          const analysisResult = extractAnalysisResult(detail)
          
          content += `
            <div class="detail-item">
              <div class="detail-header">
                <div>
                  <strong>模块:</strong> ${detail.page}
                  <span class="tag ${tagClass}">${tagText}</span>
                </div>
                <div>
                  <a href="${detail.link}" target="_blank" style="color:#3A48FB;">查看页面</a>
                </div>
              </div>
              
              <div class="detail-content">
                <div>
                  <p><strong>旧内容:</strong></p>
                  <div class="content-box">${detail.old_content || '无内容'}</div>
                </div>
                <div>
                  <p><strong>新内容:</strong></p>
                  <div class="content-box">${actualContent || '无内容'}</div>
                </div>
              </div>
          `
          
          // 如果有分析结果，添加到邮件中
          if (analysisResult) {
            content += `
              <div class="analysis">
                <h4 style="margin-top:0;margin-bottom:10px;">通义千问分析:</h4>
                ${analysisResult}
              </div>
            `
          }
          
          content += `</div>` // 关闭detail-item
        })
        
        content += `</div>` // 关闭details
      } else {
        content += `
          <div class="details">
            <h3>监控结果:</h3>
            <p>本次监控未发现明显变化</p>
          </div>
        `
      }
    }

    // 添加查看链接和页脚
    content += `
          <div style="text-align:center;margin-top:30px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" class="btn">
              查看完整详情
            </a>
          </div>
          
          <div class="footer">
            <p>此邮件由产品监控系统自动发送，请勿直接回复</p>
          </div>
        </div>
      </body>
      </html>
    `

    // 创建邮件发送器
    const transporter = createTransporter()
    
    console.log(`准备发送邮件通知:`)
    console.log(`- 收件人: ${recipients.join(', ')}`)
    console.log(`- 主题: ${subject}`)
    
    // 发送邮件
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipients.join(', '),
      subject: subject,
      html: content,
    })

    console.log(`邮件已成功发送: ${info.messageId}`)
    return true
  } catch (error) {
    console.error('发送邮件通知失败:', error)
    return false
  }
} 