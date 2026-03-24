require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendTestEmail() {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: 'silxarseb@gmail.com',
      subject: '✅ Test - Verificador de Pagos',
      text: 'Este es un email de prueba del verificador de pagos de Stripe.'
    });
    console.log('✅ Email enviado a silxarseb@gmail.com');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

sendTestEmail();