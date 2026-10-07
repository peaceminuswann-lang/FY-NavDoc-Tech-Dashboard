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
  const handlerName = 'sendDatabaseShipOutReminders';
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handlerName)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone(REMINDER_CONFIG.timeZone)
    .create();
}

function sendDatabaseShipOutReminders() {
  validateReminderConfig_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Another ship-out reminder check is already running.');
  }

  try {
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
  } finally {
    lock.releaseLock();
  }
}

function testShipOutReminderEmail() {
  validateReminderConfig_();
  GmailApp.sendEmail(
    REMINDER_CONFIG.recipient,
    'Navigation Database ship-out reminders - test',
    'This is a test email. Gmail is configured to send the scheduled ATR and B737 ship-out reminders.'
  );
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
