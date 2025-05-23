// 邮件发送服务
// 注意：这是一个示例实现，实际应用中需要使用真实的邮件服务如 Nodemailer、SendGrid 等

import nodemailer from 'nodemailer'
import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring"
import DiffMatchPatch from 'diff-match-patch'
import { exportMonitoringResults } from '@/lib/excel-service'

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

    // 生成 Excel 文件
    const excelBuffer = await exportMonitoringResults(item, record, details)
    const date = new Date(record.date).toISOString().split('T')[0]
    const fileName = `${item.name}-监控结果-${date}.xlsx`

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
      .detail-content { margin-bottom: 15px; }
      .content-box { background-color: #f5f5f5; padding: 10px; border-radius: 3px; max-height: 300px; overflow-y: auto; }
      .analysis { background-color: #edf7ff; padding: 15px; border-radius: 3px; margin-top: 10px; }
      .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
      .btn { display: inline-block; background-color: #3A48FB; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
      .tag { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; margin-left: 8px; }
      .tag-change { background-color: #fff3cd; color: #856404; }
      .tag-important { background-color: #f8d7da; color: #721c24; }
      .diff-delete { background-color: #ffdce0; color: #721c24; text-decoration: line-through; }
      .diff-add { background-color: #cdffd8; color: #155724; }
      .important-notice { background-color: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
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
      const changedDetails = details.filter(detail => detail.action === "内容变化")
      
      if (changedDetails.length > 0) {
        // 添加重要变化提醒
        const importantChanges = changedDetails.filter(detail => 
          detail.analysis_result && (
            detail.analysis_result.includes('重要变化') || 
            detail.analysis_result.includes('注意') ||
            detail.analysis_result.includes('⚠️') ||
            detail.analysis_result.includes('❗')
          )
        )

        // 添加竞品分析提醒
        const competitiveAnalysis = changedDetails.filter(detail => 
          detail.analysis_result && (
            detail.analysis_result.includes('竞品分析') ||
            detail.analysis_result.includes('竞争对手') ||
            detail.analysis_result.includes('竞品优势') ||
            detail.analysis_result.includes('竞品特点')
          )
        )

        content += `
          <div class="important-notice">
            <div><strong>📢 监控提醒：</strong> 发现 ${changedDetails.length} 处内容变化</div>
            ${importantChanges.length > 0 ? `
              <div style="margin-top:10px">
                <strong>⚠️ 重要提醒：</strong> 其中包含 ${importantChanges.length} 处重要变化，请及时查看
              </div>
            ` : ''}
            ${competitiveAnalysis.length > 0 ? `
              <div style="margin-top:10px">
                <strong>📊 竞品分析：</strong> 其中包含 ${competitiveAnalysis.length} 处竞品相关变化，建议关注
              </div>
            ` : ''}
          </div>
        `

        content += `<div class="details"><h3>变化概要:</h3>`
        
        changedDetails.forEach(detail => {
          // 判断是否为重要变化
          const isImportant = detail.analysis_result && (
            detail.analysis_result.includes('重要变化') || 
            detail.analysis_result.includes('注意') ||
            detail.analysis_result.includes('⚠️') ||
            detail.analysis_result.includes('❗')
          )

          // 判断是否包含竞品分析
          const hasCompetitiveAnalysis = detail.analysis_result && (
            detail.analysis_result.includes('竞品分析') ||
            detail.analysis_result.includes('竞争对手') ||
            detail.analysis_result.includes('竞品优势') ||
            detail.analysis_result.includes('竞品特点')
          )
          
          content += `
            <div class="detail-item">
              <div class="detail-header">
                <div>
                  <strong>模块:</strong> ${detail.page}
                  <span class="tag tag-change">内容变化</span>
                  ${isImportant ? '<span class="tag tag-important">重要变化</span>' : ''}
                  ${hasCompetitiveAnalysis ? '<span class="tag" style="background-color: #e1f5fe; color: #0277bd;">竞品分析</span>' : ''}
                </div>
                <div>
                  <a href="${detail.link}" target="_blank" style="color:#3A48FB;">查看页面</a>
                </div>
              </div>
          `
          
          // 如果有分析结果，添加到邮件中
          if (detail.analysis_result) {
            // 处理 Markdown 格式
            const formattedAnalysis = detail.analysis_result
              .replace(/### (.*)/g, '<div style="font-size:15px;font-weight:bold;margin-top:10px;margin-bottom:5px;color:#333;">$1</div>')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/- \*\*(.*?)\*\*:(.*)/g, '<div style="margin-left:15px;margin-bottom:5px;"><strong>$1:</strong>$2</div>')
              .replace(/- (.*)/g, '<div style="margin-left:15px;margin-bottom:5px;">$1</div>')
              .replace(/\n\n/g, '<br>')
              .replace(/\n/g, '<br>');

            content += `
              <div class="analysis">
                ${formattedAnalysis}
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
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://100.71.37.7:3000'}" class="btn">
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
      attachments: [
        {
          filename: fileName,
          content: Buffer.from(await excelBuffer),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })

    console.log(`邮件已成功发送: ${info.messageId}`)
    return true
  } catch (error) {
    console.error('发送邮件通知失败:', error)
    return false
  }
} 