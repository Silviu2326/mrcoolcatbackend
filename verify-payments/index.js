require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const CONFIG = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_TU_CLAVE_STRIPE_AQUI',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://tu-proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'TU_SERVICE_ROLE_KEY',
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '0 */5 * * *',
  ENABLE_LOGGING: process.env.ENABLE_LOGGING !== 'false'
};

const stripe = new Stripe(CONFIG.STRIPE_SECRET_KEY);
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function log(message, type = 'INFO') {
  if (!CONFIG.ENABLE_LOGGING) return;

  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '📋',
    'SUCCESS': '✅',
    'WARNING': '⚠️',
    'ERROR': '❌'
  }[type] || '📋';

  console.log(`${prefix} [${timestamp}] ${message}`);
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendNotificationEmail(order, newStatus) {
  if (!process.env.NOTIFY_EMAIL || newStatus !== 'completed') return;

  const subject = `🛒 Nuevo pedido - Orden ${order.order_number}`;

  const text = `
¡Hay un nuevo pedido confirmado!

Orden: ${order.order_number}
Monto: ${order.total}

Revisa el backoffice para procesar el pedido.
Fecha: ${new Date().toISOString()}
  `.trim();

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: process.env.NOTIFY_EMAIL,
      subject,
      text
    });
    log(`Email enviado a ${process.env.NOTIFY_EMAIL}`, 'SUCCESS');
  } catch (error) {
    log(`Error enviando email: ${error.message}`, 'ERROR');
  }
}

async function verifyPendingPayments() {
  log('Iniciando verificación de pagos pendientes...');

  try {
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, stripe_payment_intent_id, status, total, created_at')
      .eq('status', 'pending')
      .not('stripe_payment_intent_id', 'is', null);

    if (fetchError) {
      log(`Error consultando órdenes: ${fetchError.message}`, 'ERROR');
      return;
    }

    if (!orders || orders.length === 0) {
      log('No hay órdenes pendientes por verificar', 'INFO');
      return;
    }

    log(`Encontradas ${orders.length} órdenes pendientes`, 'INFO');

    let updatedCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        if (!order.stripe_payment_intent_id) {
          log(`Orden ${order.order_number} sin stripe_payment_intent_id, saltando`, 'WARNING');
          continue;
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id
        );

        log(`Verificando orden ${order.order_number}: ${paymentIntent.status}`, 'INFO');

        let newStatus = null;
        let paymentStatus = null;

        switch (paymentIntent.status) {
          case 'succeeded':
            newStatus = 'completed';
            paymentStatus = 'paid';
            break;
          case 'processing':
            newStatus = 'processing';
            paymentStatus = 'processing';
            break;
          case 'requires_payment_method':
          case 'failed':
            newStatus = 'failed';
            paymentStatus = 'failed';
            break;
          case 'canceled':
            newStatus = 'cancelled';
            paymentStatus = 'canceled';
            break;
          case 'requires_action':
          case 'requires_confirmation':
            log(`Orden ${order.order_number} aún en proceso: ${paymentIntent.status}`, 'INFO');
            continue;
          default:
            log(`Estado desconocido para orden ${order.order_number}: ${paymentIntent.status}`, 'WARNING');
            continue;
        }

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: newStatus,
            stripe_payment_status: paymentStatus,
            paid_at: newStatus === 'completed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id);

        if (updateError) {
          log(`Error actualizando orden ${order.order_number}: ${updateError.message}`, 'ERROR');
          errorCount++;
        } else {
          log(`Orden ${order.order_number} actualizada a ${newStatus}`, 'SUCCESS');
          await sendNotificationEmail(order, newStatus);
          updatedCount++;
        }

      } catch (stripeError) {
        log(`Error consultando Stripe para orden ${order.order_number}: ${stripeError.message}`, 'ERROR');
        errorCount++;
      }
    }

    log(`Verificación completada: ${updatedCount} actualizadas, ${errorCount} errores`, 'INFO');

  } catch (error) {
    log(`Error general: ${error.message}`, 'ERROR');
  }
}

async function cleanupOldFailedOrders() {
  log('Iniciando limpieza de órdenes fallidas antiguas...');

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        stripe_payment_status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo.toISOString());

    if (error) {
      log(`Error en limpieza: ${error.message}`, 'ERROR');
    } else {
      log(`Limpieza completada: ${data?.length || 0} órdenes canceladas`, 'SUCCESS');
    }
  } catch (error) {
    log(`Error en limpieza: ${error.message}`, 'ERROR');
  }
}

function startCronJob() {
  log(`Cron job configurado: ${CONFIG.CRON_SCHEDULE}`);
  log('Presiona Ctrl+C para detener');

  cron.schedule(CONFIG.CRON_SCHEDULE, () => {
    verifyPendingPayments();
  });

  cron.schedule('0 3 * * *', () => {
    cleanupOldFailedOrders();
  });

  verifyPendingPayments();
}

if (require.main === module) {
  console.log('===========================================');
  console.log('  VERIFICADOR DE PAGOS DE STRIPE');
  console.log('===========================================');
  console.log('');

  if (CONFIG.STRIPE_SECRET_KEY.includes('TU_CLAVE') || CONFIG.STRIPE_SECRET_KEY === '') {
    console.error('❌ ERROR: Debes configurar STRIPE_SECRET_KEY en el archivo .env');
    console.error('');
    process.exit(1);
  }

  if (CONFIG.SUPABASE_SERVICE_ROLE_KEY.includes('TU_SERVICE') || CONFIG.SUPABASE_SERVICE_ROLE_KEY === '') {
    console.error('❌ ERROR: Debes configurar SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
    console.error('');
    process.exit(1);
  }

  console.log('✅ Configuración cargada');
  console.log(`   - Stripe: ${CONFIG.STRIPE_SECRET_KEY.substring(0, 10)}...`);
  console.log(`   - Supabase: ${CONFIG.SUPABASE_URL}`);
  console.log(`   - Schedule: ${CONFIG.CRON_SCHEDULE}`);
  console.log('');

  startCronJob();
}

module.exports = {
  verifyPendingPayments,
  cleanupOldFailedOrders,
  startCronJob
};