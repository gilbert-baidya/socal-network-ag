const RESPONSE_SHEET_NAME = 'Form Responses 1';
const WEBSITE_SHEET_NAME = 'Website Registrations';
const DASHBOARD_SHEET_NAME = 'Dashboard';
const ORGANIZER_SESSION_PREFIX = 'organizer_session_';
const ORGANIZER_SESSION_SECONDS = 1800;
const REGISTRATION_CLOSE_DATE = '2026-10-06';
const EVENT_TIME_ZONE = 'America/Los_Angeles';
const RESPONSE_HEADERS = [
  'Timestamp',
  'Full Name',
  'Phone Number',
  'Email Address',
  'Church or Organization',
  'Number Attending'
];
const WEBSITE_HEADERS = [
  'Timestamp', 'Submission ID', 'Full Name', 'Phone Number', 'Email Address',
  'Church or Organization', 'Number of Guests', 'Guest 1', 'Guest 2', 'Guest 3',
  'Guest 4', 'Guest 5', 'Guest 6', 'Guest 7', 'Guest 8', 'Guest 9', 'Guest 10',
  'Total Attendees'
];

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeText_(value, maxLength) {
  const text = String(value === null || value === undefined ? '' : value)
    .trim().replace(/\s+/g, ' ');
  return maxLength ? text.slice(0, maxLength) : text;
}

function isBlankRow_(row) {
  return !row.some((cell) => cell !== '' && cell !== null && cell !== undefined);
}

function getSheetData_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0) {
    return { rows: [], columns: {}, sheet: sheet };
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((header) => normalizeText_(header));
  const columns = {};
  headers.forEach((header, index) => { if (header) columns[header] = index; });
  return { rows: values.slice(1), columns: columns, sheet: sheet };
}

function ensureWebsiteRegistrationsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(WEBSITE_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(WEBSITE_SHEET_NAME);
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => normalizeText_(header))
    : [];
  WEBSITE_HEADERS.forEach((header) => {
    if (currentHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      currentHeaders.push(header);
    }
  });
  return sheet;
}

function getAttendanceData() {
  const records = getNormalizedRecords_();
  return {
    registrations: records.length,
    attendees: records.reduce((total, record) => total + record.totalAttendees, 0)
  };
}

function doGet() {
  try {
    const totals = getAttendanceData();
    return jsonResponse({
      status: 'ok',
      registrations: totals.registrations,
      attendees: totals.attendees
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      registrations: 0,
      attendees: 0
    });
  }
}

function doPost(e) {
  const action = e && e.parameter ? e.parameter.action : '';

  try {
    if (action === 'login') {
      return handleOrganizerLogin_(e.parameter);
    }
    if (action === 'report') {
      return handleOrganizerReport_(e.parameter);
    }
    if (action === 'logout') {
      return handleOrganizerLogout_(e.parameter);
    }
    if (action === 'register') {
      return handleWebsiteRegistration_(e.parameter);
    }

    return jsonResponse({ status: 'error', code: 'INVALID_ACTION' });
  } catch (error) {
    return jsonResponse({ status: 'error', code: 'SERVER_ERROR' });
  }
}

function isRegistrationClosed_() {
  return Utilities.formatDate(new Date(), EVENT_TIME_ZONE, 'yyyy-MM-dd') >= REGISTRATION_CLOSE_DATE;
}

function containsMarkup_(value) {
  return /<[^>]*>/.test(value);
}

function parseGuestCount_(value) {
  if (!/^\d+$/.test(String(value || '').trim())) return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= 10 ? count : null;
}

function validateRegistrationParameters_(parameters) {
  const fields = {
    submissionId: normalizeText_(parameters.submissionId, 100),
    fullName: normalizeText_(parameters.fullName, 120),
    phone: normalizeText_(parameters.phone, 40),
    email: normalizeText_(parameters.email, 160),
    church: normalizeText_(parameters.church, 160)
  };
  const guestCount = parseGuestCount_(parameters.guestCount);
  const invalid = !fields.submissionId || !fields.fullName || !fields.phone || !fields.email || !fields.church ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
    Object.keys(fields).some((key) => containsMarkup_(fields[key]));
  if (invalid || guestCount === null) return null;
  const guestNames = [];
  for (let index = 1; index <= guestCount; index += 1) {
    const guestName = normalizeText_(parameters['guest' + index], 120);
    if (!guestName || containsMarkup_(guestName)) return null;
    guestNames.push(guestName);
  }
  return { fields: fields, guestCount: guestCount, guestNames: guestNames };
}

function findSubmissionId_(sheet, columns, submissionId) {
  const idColumn = columns['Submission ID'];
  if (idColumn === undefined || sheet.getLastRow() < 2) return false;
  const ids = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).getValues();
  return ids.some((row) => String(row[0]).trim() === submissionId);
}

function handleWebsiteRegistration_(parameters) {
  if (isRegistrationClosed_()) return jsonResponse({ status: 'error', code: 'REGISTRATION_CLOSED' });
  if (parameters.website) return jsonResponse({ status: 'ok', registration: { totalAttendees: 0 } });
  const validated = validateRegistrationParameters_(parameters);
  if (!validated) return jsonResponse({ status: 'error', code: 'VALIDATION_ERROR' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureWebsiteRegistrationsSheet_();
    const data = getSheetData_(WEBSITE_SHEET_NAME);
    if (findSubmissionId_(sheet, data.columns, validated.fields.submissionId)) {
      return jsonResponse({ status: 'ok', code: 'DUPLICATE_SUBMISSION', registration: { totalAttendees: 1 + validated.guestCount } });
    }
    const row = WEBSITE_HEADERS.map((header) => {
      if (header === 'Timestamp') return new Date();
      if (header === 'Submission ID') return validated.fields.submissionId;
      if (header === 'Full Name') return validated.fields.fullName;
      if (header === 'Phone Number') return validated.fields.phone;
      if (header === 'Email Address') return validated.fields.email;
      if (header === 'Church or Organization') return validated.fields.church;
      if (header === 'Number of Guests') return validated.guestCount;
      if (/^Guest \d+$/.test(header)) return validated.guestNames[Number(header.slice(6)) - 1] || '';
      if (header === 'Total Attendees') return 1 + validated.guestCount;
      return '';
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, WEBSITE_HEADERS.length).setValues([row]);
    return jsonResponse({ status: 'ok', registration: { totalAttendees: 1 + validated.guestCount } });
  } catch (error) {
    console.error(error);
    return jsonResponse({ status: 'error', code: 'SERVER_ERROR' });
  } finally {
    lock.releaseLock();
  }
}

function hashPassword_(password) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );

  return digest.map((byte) => {
    const hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Run manually once in Apps Script to initialize the requested organizer credentials.
function setupOrganizerCredentials() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    ORGANIZER_LOGIN_ID: 'socal',
    ORGANIZER_PASSWORD_HASH: hashPassword_('socal')
  });
  console.log('Organizer credentials initialized.');
}

function createOrganizerSession_() {
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  CacheService.getScriptCache().put(
    ORGANIZER_SESSION_PREFIX + token,
    'authenticated',
    ORGANIZER_SESSION_SECONDS
  );
  return token;
}

function hasOrganizerSession_(token) {
  if (!token || typeof token !== 'string' || token.length > 160) {
    return false;
  }

  const cache = CacheService.getScriptCache();
  const key = ORGANIZER_SESSION_PREFIX + token;
  if (cache.get(key) !== 'authenticated') {
    return false;
  }

  cache.put(key, 'authenticated', ORGANIZER_SESSION_SECONDS);
  return true;
}

function handleOrganizerLogin_(parameters) {
  const properties = PropertiesService.getScriptProperties();
  const storedLoginId = properties.getProperty('ORGANIZER_LOGIN_ID');
  const storedPasswordHash = properties.getProperty('ORGANIZER_PASSWORD_HASH');
  const loginId = String(parameters.loginId || '').trim();
  const password = String(parameters.password || '');

  if (!storedLoginId || !storedPasswordHash ||
      loginId !== storedLoginId || hashPassword_(password) !== storedPasswordHash) {
    return jsonResponse({ status: 'error', code: 'INVALID_CREDENTIALS' });
  }

  return jsonResponse({
    status: 'ok',
    token: createOrganizerSession_(),
    expiresIn: ORGANIZER_SESSION_SECONDS
  });
}

function handleOrganizerReport_(parameters) {
  if (!hasOrganizerSession_(parameters.token)) {
    return jsonResponse({ status: 'error', code: 'UNAUTHORIZED' });
  }

  const report = buildPrivateReport_();
  return jsonResponse({
    status: 'ok',
    summary: report.summary,
    groups: report.groups,
    registrations: report.registrations
  });
}

function handleOrganizerLogout_(parameters) {
  if (parameters.token) {
    CacheService.getScriptCache().remove(ORGANIZER_SESSION_PREFIX + parameters.token);
  }
  return jsonResponse({ status: 'ok' });
}

function testAttendanceData() {
  const totals = getAttendanceData();
  console.log('Registrations: ' + totals.registrations);
  console.log('Attendees: ' + totals.attendees);
}

function normalizeChurchName(value) {
  const cleanName = String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
  const displayName = cleanName || 'Unspecified';

  return {
    key: displayName.toLowerCase(),
    displayName: displayName
  };
}

function getSafeAttendeeValue_(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function buildLegacyRecords_() {
  const responseData = getSheetData_(RESPONSE_SHEET_NAME);
  if (!responseData.sheet) return [];
  return responseData.rows.filter((row) => !isBlankRow_(row)).map((row) => ({
    fullName: normalizeText_(row[responseData.columns['Full Name']], 120),
    phone: normalizeText_(row[responseData.columns['Phone Number']], 40),
    email: normalizeText_(row[responseData.columns['Email Address']], 160),
    church: normalizeText_(row[responseData.columns['Church or Organization']], 160),
    guestCount: null,
    totalAttendees: getSafeAttendeeValue_(row[responseData.columns['Number Attending']]),
    guestNames: [],
    source: 'legacy',
    timestamp: row[responseData.columns['Timestamp']] || ''
  }));
}

function buildWebsiteRecords_() {
  const responseData = getSheetData_(WEBSITE_SHEET_NAME);
  if (!responseData.sheet) return [];
  return responseData.rows.filter((row) => !isBlankRow_(row)).map((row) => {
    const guestCount = getSafeAttendeeValue_(row[responseData.columns['Number of Guests']]);
    const guestNames = [];
    for (let index = 1; index <= 10; index += 1) {
      const value = normalizeText_(row[responseData.columns['Guest ' + index]], 120);
      if (value) guestNames.push(value);
    }
    return {
      fullName: normalizeText_(row[responseData.columns['Full Name']], 120),
      phone: normalizeText_(row[responseData.columns['Phone Number']], 40),
      email: normalizeText_(row[responseData.columns['Email Address']], 160),
      church: normalizeText_(row[responseData.columns['Church or Organization']], 160),
      guestCount: guestCount,
      totalAttendees: getSafeAttendeeValue_(row[responseData.columns['Total Attendees']]) || 1 + guestCount,
      guestNames: guestNames,
      source: 'website',
      timestamp: row[responseData.columns['Timestamp']] || ''
    };
  });
}

function getNormalizedRecords_() {
  return buildLegacyRecords_().concat(buildWebsiteRecords_());
}

function buildPrivateReport_() {
  ensureWebsiteRegistrationsSheet_();
  const records = getNormalizedRecords_();
  const churchGroups = {};
  let registrations = 0;
  let attendees = 0;

  records.forEach((record) => {
    registrations += 1;
    const church = normalizeChurchName(record.church);
    const group = churchGroups[church.key] || {
      name: church.displayName,
      registrations: 0,
      attendees: 0
    };
    group.registrations += 1;
    group.attendees += record.totalAttendees;
    churchGroups[church.key] = group;
    attendees += record.totalAttendees;
  });

  const groups = Object.keys(churchGroups).map((key) => churchGroups[key]);
  groups.sort((left, right) => {
    if (right.attendees !== left.attendees) {
      return right.attendees - left.attendees;
    }
    if (right.registrations !== left.registrations) {
      return right.registrations - left.registrations;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    summary: {
      registrations: registrations,
      attendees: attendees,
      churches: groups.length
    },
    groups: groups,
    registrations: records
  };
}

function refreshPrivateDashboard() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let dashboard = spreadsheet.getSheetByName(DASHBOARD_SHEET_NAME);
  if (!dashboard) {
    dashboard = spreadsheet.insertSheet(DASHBOARD_SHEET_NAME);
  }

  const report = buildPrivateReport_();
  const groups = report.groups;

  dashboard.clear();
  dashboard.getRange('A1').setValue('Annual Intercultural Pastors Appreciation Dinner');
  dashboard.getRange('A2').setValue('Private Registration Dashboard');
  dashboard.getRange('A4:B7').setValues([
    ['Total Registrations', report.summary.registrations],
    ['Total Attendees', report.summary.attendees],
    ['Churches / Organizations Represented', groups.length],
    ['Last Updated', new Date()]
  ]);
  dashboard.getRange('A10:C10').setValues([[
    'Church / Organization',
    'Registrations',
    'Total Attendees'
  ]]);

  if (groups.length > 0) {
    dashboard.getRange(11, 1, groups.length, 3).setValues(
      groups.map((group) => [group.name, group.registrations, group.attendees])
    );
  }

  dashboard.getRange('A1:D1').setFontWeight('bold').setFontSize(16);
  dashboard.getRange('A2:D2').setFontWeight('bold').setFontSize(12);
  dashboard.getRange('A4:B7')
    .setBackground('#f1f3f4')
    .setBorder(true, true, true, true, true, true);
  dashboard.getRange('A4:A7').setFontWeight('bold');
  dashboard.getRange('B4:B6').setFontWeight('bold').setNumberFormat('0');
  dashboard.getRange('B7').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  dashboard.getRange('A10:C10')
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#174f50')
    .setBorder(true, true, true, true, true, true);
  if (groups.length > 0) {
    dashboard.getRange(11, 1, groups.length, 3)
      .setBorder(true, true, true, true, true, true)
      .setNumberFormat('0');
    dashboard.getRange(11, 1, groups.length, 1).setNumberFormat('@');
  }
  dashboard.setFrozenRows(10);
  dashboard.setColumnWidth(1, 280);
  dashboard.setColumnWidth(2, 130);
  dashboard.setColumnWidth(3, 140);
  dashboard.setColumnWidth(4, 24);
  dashboard.getRange('A1:C7').setHorizontalAlignment('left');
  dashboard.getRange('B4:C1000').setHorizontalAlignment('right');

  return {
    registrations: report.summary.registrations,
    attendees: report.summary.attendees,
    churches: report.summary.churches
  };
}

function onFormSubmitDashboard(e) {
  refreshPrivateDashboard();
}

function setupDashboardTrigger() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const hasTrigger = ScriptApp.getProjectTriggers().some((trigger) => {
    return trigger.getHandlerFunction() === 'onFormSubmitDashboard' &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT;
  });

  if (!hasTrigger) {
    ScriptApp.newTrigger('onFormSubmitDashboard')
      .forSpreadsheet(spreadsheet)
      .onFormSubmit()
      .create();
  }
}

function removeDashboardTrigger() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'onFormSubmitDashboard') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function setupPrivateDashboard() {
  refreshPrivateDashboard();
  setupDashboardTrigger();
  console.log('Private dashboard refreshed and trigger is ready.');
}

function testPrivateDashboard() {
  const totals = refreshPrivateDashboard();
  console.log('Total Registrations: ' + totals.registrations);
  console.log('Total Attendees: ' + totals.attendees);
  console.log('Churches Represented: ' + totals.churches);
}

function testOrganizerReport() {
  const report = buildPrivateReport_();
  console.log('Total Registrations: ' + report.summary.registrations);
  console.log('Total Attendees: ' + report.summary.attendees);
  console.log('Churches Represented: ' + report.summary.churches);
}