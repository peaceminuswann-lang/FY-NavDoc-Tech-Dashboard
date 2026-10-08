const REMINDER_CONFIG = {
  recipient: 'REPLACE_WITH_RECIPIENT_EMAIL',
  supabaseUrl: 'https://mefobbecnrgleyuimsld.supabase.co',
  supabasePublishableKey: 'REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY',
  timeZone: 'Asia/Kuala_Lumpur'
};

const CYCLE_LENGTH_DAYS = 28;
const REMINDER_DAYS_BEFORE_EFFECTIVE = 11;
const SHIP_OUT_DAYS_BEFORE_EFFECTIVE = 8;

function setupDailyShipOutReminderTrigger() {
  const handlerNames = [
    'sendDatabaseShipOutReminders',
    'sendPaymentDueReminders',
    'sendScheduledReminders'
  ];
  ScriptApp.getProjectTriggers()
    .filter(trigger => handlerNames.includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('sendScheduledReminders')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone(REMINDER_CONFIG.timeZone)
    .create();
}

function sendScheduledReminders() {
  validateReminderConfig_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Another scheduled reminder run is already in progress.');
  }

  const errors = [];
  try {
    [
      sendDatabaseShipOutReminders,
      sendPaymentDueReminders
    ].forEach(sendReminder => {
      try {
        sendReminder();
      } catch (error) {
        console.error(`Reminder task failed: ${error.message}`);
        errors.push(error.message);
      }
    });
  } finally {
    lock.releaseLock();
  }

  if (errors.length) {
    throw new Error(`One or more reminder tasks failed: ${errors.join('; ')}`);
  }
}

function sendDatabaseShipOutReminders() {
  validateReminderConfig_();
  const databaseData = fetchDatabaseData_();
  const today = Utilities.formatDate(new Date(), REMINDER_CONFIG.timeZone, 'yyyy-MM-dd');
  const fleets = [
    { name: 'ATR', navigation: databaseData.atr && databaseData.atr.navigation },
    { name: 'B737', navigation: databaseData.b737 && databaseData.b737.navigation }
  ];
  const properties = PropertiesService.getScriptProperties();

  fleets.forEach(fleet => {
    const dueReminder = getDueReminder_(fleet, today);
    if (!dueReminder) return;

    const sentKey = `sent:${fleet.name}:${dueReminder.cycle}:${dueReminder.shipOutDate}`;
    if (properties.getProperty(sentKey)) return;

    const subject = `${fleet.name} Navigation Database ship-out reminder - AIRAC ${dueReminder.cycle}`;
    const body = [
      `The ${fleet.name} navigation database for AIRAC ${dueReminder.cycle} is due to ship out in 3 days.`,
      '',
      `Ship-out date: ${dueReminder.shipOutDate}`,
      `Cycle effective date: ${dueReminder.effectiveDate}`,
      '',
      'This is an automated reminder.'
    ].join('\n');

    GmailApp.sendEmail(REMINDER_CONFIG.recipient, subject, body);
    properties.setProperty(sentKey, new Date().toISOString());
  });
}

function testShipOutReminderEmail() {
  validateReminderConfig_();
  GmailApp.sendEmail(
    REMINDER_CONFIG.recipient,
    'Navigation Database ship-out reminders - test',
    'This is a test email. Gmail is configured to send the scheduled ATR and B737 ship-out reminders.'
  );
}

function sendPaymentDueReminders() {
  validateReminderConfig_();
  const payments = fetchPaymentData_();
  const today = Utilities.formatDate(new Date(), REMINDER_CONFIG.timeZone, 'yyyy-MM-dd');
  const properties = PropertiesService.getScriptProperties();
  const duePayments = payments.filter(payment => {
    if (String(payment.paymentDoneDate || '').trim()) return false;

    const dueDate = parsePaymentDate_(payment.date);
    if (!dueDate) {
      throw new Error(`Payment "${payment.paymentName || payment.vendor || payment.id}" has an invalid payment date.`);
    }

    const reminderDate = addDays_(dueDate, -3);
    return formatIsoDate_(reminderDate) === today;
  });
  const unsentPayments = duePayments.filter(payment => {
    const dueDate = formatIsoDate_(parsePaymentDate_(payment.date));
    const paymentId = payment.id === undefined || payment.id === null
      ? `${payment.paymentName || payment.vendor}:${dueDate}`
      : String(payment.id);
    return !properties.getProperty(`sent:payment:${paymentId}:${dueDate}`);
  });

  if (!unsentPayments.length) return;

  const lines = unsentPayments.map(payment => [
    `Payment: ${payment.paymentName || payment.vendor || 'Unnamed payment'}`,
    `Vendor: ${payment.vendor || 'Not specified'}`,
    `Amount: ${payment.currency || ''} ${Number(payment.amount || 0).toFixed(2)}`,
    `Due date: ${formatIsoDate_(parsePaymentDate_(payment.date))}`,
    `PO number: ${payment.poNumber || 'N/A'}`,
    `Invoice number: ${payment.invoiceNumber || 'N/A'}`
  ].join('\n'));
  GmailApp.sendEmail(
    REMINDER_CONFIG.recipient,
    `Payment reminder: ${unsentPayments.length} payment${unsentPayments.length === 1 ? '' : 's'} due in 3 days`,
    [
      'The following payment(s) are due in 3 days:',
      '',
      lines.join('\n\n'),
      '',
      'This is an automated reminder.'
    ].join('\n')
  );

  unsentPayments.forEach(payment => {
    const dueDate = formatIsoDate_(parsePaymentDate_(payment.date));
    const paymentId = payment.id === undefined || payment.id === null
      ? `${payment.paymentName || payment.vendor}:${dueDate}`
      : String(payment.id);
    properties.setProperty(`sent:payment:${paymentId}:${dueDate}`, new Date().toISOString());
  });
}

function testPaymentDueReminderEmail() {
  validateReminderConfig_();
  GmailApp.sendEmail(
    REMINDER_CONFIG.recipient,
    'Payment reminder - test',
    'This is a test email for the scheduled payment due reminders.'
  );
}

function fetchPaymentData_() {
  const url = `${REMINDER_CONFIG.supabaseUrl}/rest/v1/app_storage?key=eq.paymentDashboardData&select=value`;
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: REMINDER_CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${REMINDER_CONFIG.supabasePublishableKey}`,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase returned HTTP ${status} while reading payment data: ${response.getContentText()}`);
  }

  const rows = JSON.parse(response.getContentText());
  if (!Array.isArray(rows) || !rows[0] || !rows[0].value || !Array.isArray(rows[0].value.paymentData)) {
    throw new Error('Supabase returned no valid paymentDashboardData row.');
  }
  return rows[0].value.paymentData;
}

function parsePaymentDate_(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const displayMatch = normalized.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]) - 1;
    day = Number(isoMatch[3]);
  } else if (displayMatch) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    day = Number(displayMatch[1]);
    month = monthNames.findIndex(name => name.toLowerCase() === displayMatch[2].toLowerCase());
    year = Number(displayMatch[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

function getDueReminder_(fleet, today) {
  const navigation = fleet.navigation;
  if (!navigation || typeof navigation.cycle !== 'string' || !navigation.effectiveDate) return null;

  const cycleMatch = navigation.cycle.replace(/^AIRAC\s*/i, '').trim().match(/^(\d{2})(\d{2})$/);
  if (!cycleMatch) throw new Error(`Invalid ${fleet.name} reference AIRAC cycle: ${navigation.cycle}`);
  const referenceYear = Number(cycleMatch[1]);
  const referenceCycle = Number(cycleMatch[2]);
  if (referenceCycle < 1 || referenceCycle > 13) {
    throw new Error(`Invalid ${fleet.name} AIRAC cycle number: ${navigation.cycle}`);
  }

  const effectiveDate = parseIsoDate_(navigation.effectiveDate);
  const firstReminderDate = addDays_(effectiveDate, -REMINDER_DAYS_BEFORE_EFFECTIVE);
  const daysSinceFirstReminder = dateDifference_(firstReminderDate, parseIsoDate_(today));
  if (daysSinceFirstReminder < 0 || daysSinceFirstReminder % CYCLE_LENGTH_DAYS !== 0) return null;

  const cycleOffset = daysSinceFirstReminder / CYCLE_LENGTH_DAYS;
  const cycleIndex = referenceCycle - 1 + cycleOffset;
  const cycleYear = (referenceYear + Math.floor(cycleIndex / 13)) % 100;
  const cycleNumber = (cycleIndex % 13) + 1;
  const cycle = `${String(cycleYear).padStart(2, '0')}${String(cycleNumber).padStart(2, '0')}`;
  const cycleEffectiveDate = addDays_(effectiveDate, cycleOffset * CYCLE_LENGTH_DAYS);
  const shipOutDate = addDays_(cycleEffectiveDate, -SHIP_OUT_DAYS_BEFORE_EFFECTIVE);

  return {
    cycle,
    effectiveDate: formatIsoDate_(cycleEffectiveDate),
    shipOutDate: formatIsoDate_(shipOutDate)
  };
}

function fetchDatabaseData_() {
  const url = `${REMINDER_CONFIG.supabaseUrl}/rest/v1/app_storage?key=eq.databaseData&select=value`;
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: REMINDER_CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${REMINDER_CONFIG.supabasePublishableKey}`,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase returned HTTP ${status}: ${response.getContentText()}`);
  }

  const rows = JSON.parse(response.getContentText());
  if (!Array.isArray(rows) || !rows[0] || !rows[0].value) {
    throw new Error('Supabase returned no saved databaseData row.');
  }
  return rows[0].value;
}

function validateReminderConfig_() {
  if (!REMINDER_CONFIG.recipient || REMINDER_CONFIG.recipient.indexOf('REPLACE_') === 0) {
    throw new Error('Set REMINDER_CONFIG.recipient to the email address that should receive reminders.');
  }
  if (!REMINDER_CONFIG.supabasePublishableKey || REMINDER_CONFIG.supabasePublishableKey.indexOf('REPLACE_') === 0) {
    throw new Error('Set REMINDER_CONFIG.supabasePublishableKey to the publishable key configured in index.html.');
  }
}

function parseIsoDate_(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid database date: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addDays_(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateDifference_(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatIsoDate_(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}
