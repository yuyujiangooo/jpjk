// 测试邮件发送功能
require('dotenv').config({ path: '.env.local' });
const nodemailer = require('nodemailer');

async function testEmailSending() {
  try {
    // 创建邮件发送器
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // 测试连接
    console.log('正在测试邮件服务器连接...');
    await transporter.verify();
    console.log('邮件服务器连接成功！');

    // 发送测试邮件
    console.log('正在发送测试邮件...');
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SMTP_USER, // 发送给自己
      subject: '产品监控系统 - 邮件发送测试',
      html: `
        <h2>这是一封测试邮件</h2>
        <p>如果您收到这封邮件，说明产品监控系统的邮件发送功能配置正确。</p>
        <p>时间: ${new Date().toLocaleString()}</p>
      `,
    });

    console.log('测试邮件发送成功！');
    console.log('邮件ID:', info.messageId);
  } catch (error) {
    console.error('测试邮件发送失败:', error);
  }
}

testEmailSending(); 