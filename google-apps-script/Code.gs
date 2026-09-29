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
  'Church or Organization', 'Number Attending', 'Attendee 1', 'Attendee 2', 'Attendee 3',
  'Attendee 4', 'Attendee 5', 'Attendee 6', 'Attendee 7', 'Attendee 8', 'Attendee 9', 'Attendee 10',
  'Total Attendees', 'Manage Token Hash', 'Updated At'
];
const CHANGE_LOG_SHEET_NAME = 'Registration Change Log';
const CHANGE_LOG_HEADERS = [
  'Timestamp', 'Submission ID', 'Previous Number Attending', 'New Number Attending',
  'Previous Church', 'New Church', 'Change Type'
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
  migrateWebsiteRegistrations_(sheet);
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

function migrateWebsiteRegistrations_(sheet) {
  if (sheet.getLastColumn() === 0) return;
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headerRange.getValues()[0].map((header) => normalizeText_(header));
  const replacements = { 'Number of Guests': 'Number Attending' };
  for (let index = 1; index <= 10; index += 1) {
    replacements['Guest ' + index] = 'Attendee ' + index;
  }
  Object.keys(replacements).forEach((oldHeader) => {
    const oldIndex = headers.indexOf(oldHeader);
    const newHeader = replacements[oldHeader];
    if (oldIndex !== -1 && headers.indexOf(newHeader) === -1) {
      sheet.getRange(1, oldIndex + 1).setValue(newHeader);
      headers[oldIndex] = newHeader;
    }
  });
  const numberAttendingIndex = headers.indexOf('Number Attending');
  const totalAttendeesIndex = headers.indexOf('Total Attendees');
  const rowCount = sheet.getLastRow() - 1;
  if (numberAttendingIndex === -1 || totalAttendeesIndex === -1 || rowCount <= 0) return;
  const numberAttendingValues = sheet.getRange(2, numberAttendingIndex + 1, rowCount, 1).getValues();
  const totalAttendeeValues = sheet.getRange(2, totalAttendeesIndex + 1, rowCount, 1).getValues();
  let changed = false;
  numberAttendingValues.forEach((row, index) => {
    if (row[0] !== '' && row[0] !== null && totalAttendeeValues[index][0] !== row[0]) {
      totalAttendeeValues[index][0] = row[0];
      changed = true;
    }
  });
  if (changed) {
    sheet.getRange(2, totalAttendeesIndex + 1, rowCount, 1).setValues(totalAttendeeValues);
  }
}

function getAttendanceData() {
  const records = getNormalizedRecords_().filter((record) => record.isValid);
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
    if (action === 'refreshDashboard') {
      return handleDashboardRefresh_(e.parameter);
    }
    if (action === 'logout') {
      return handleOrganizerLogout_(e.parameter);
    }
    if (action === 'register') {
      return handleWebsiteRegistration_(e.parameter);
    }
    if (action === 'requestManageLink') {
      return handleManageLinkRequest_(e.parameter);
    }
    if (action === 'loadRegistration') {
      return handleLoadRegistration_(e.parameter);
    }
    if (action === 'updateRegistration') {
      return handleRegistrationUpdate_(e.parameter);
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

function parseNumberAttending_(value) {
  if (!/^\d+$/.test(String(value || '').trim())) return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 10 ? count : null;
}

function normalizeEmail_(value) {
  return normalizeText_(value, 160).toLowerCase();
}

function normalizePhone_(value) {
  return normalizeText_(value, 40).replace(/[^\d+]/g, '');
}

function createManageToken_() {
  const rawToken = Utilities.getUuid() + '-' + Utilities.getUuid() + '-' + Utilities.getUuid();
  return { raw: rawToken, hash: hashPassword_(rawToken) };
}

function getManagementUrl_(rawToken, requestedBaseUrl) {
  const configuredBaseUrl = PropertiesService.getScriptProperties().getProperty('MANAGEMENT_BASE_URL');
  const baseUrl = normalizeText_(configuredBaseUrl || requestedBaseUrl, 500);
  if (!/^https:\/\//i.test(baseUrl)) return '';
  return baseUrl.replace(/[?#].*$/, '') + '?manage=' + encodeURIComponent(rawToken);
}

function ensureChangeLogSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(CHANGE_LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CHANGE_LOG_SHEET_NAME);
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => normalizeText_(header))
    : [];
  CHANGE_LOG_HEADERS.forEach((header) => {
    if (currentHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      currentHeaders.push(header);
    }
  });
  return sheet;
}

function findWebsiteRowsByEmail_(sheet, columns, email) {
  const emailColumn = columns['Email Address'];
  if (emailColumn === undefined || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const normalizedEmail = normalizeEmail_(email);
  return values.map((row, index) => ({ row: row, rowNumber: index + 2 }))
    .filter((entry) => normalizeEmail_(entry.row[emailColumn]) === normalizedEmail);
}

function getWebsiteRegistrationFromRow_(row, columns) {
  const numberAttending = getSafeAttendeeValue_(row[columns['Number Attending']]);
  const attendeeNames = [];
  for (let index = 1; index <= numberAttending; index += 1) {
    attendeeNames.push(normalizeText_(row[columns['Attendee ' + index]], 120));
  }
  return {
    fullName: normalizeText_(row[columns['Full Name']], 120),
    phone: normalizeText_(row[columns['Phone Number']], 40),
    email: normalizeText_(row[columns['Email Address']], 160),
    church: normalizeText_(row[columns['Church or Organization']], 160),
    numberAttending: numberAttending,
    attendeeNames: attendeeNames
  };
}

function sendManagementEmail_(email, links) {
  const body = [
    'Annual Intercultural Pastors Appreciation Dinner',
    '',
    'You requested a link to manage your registration.',
    'Registration closes October 5, 2026.',
    '',
    'Secure management link(s):',
    links.join('\n')
  ].join('\n');
  MailApp.sendEmail({
    to: email,
    subject: 'Manage Your Pastors Appreciation Dinner Registration',
    body: body
  });
}

function handleManageLinkRequest_(parameters) {
  const email = normalizeEmail_(parameters.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ status: 'error', code: 'VALIDATION_ERROR' });
  }
  const sheet = ensureWebsiteRegistrationsSheet_();
  const data = getSheetData_(WEBSITE_SHEET_NAME);
  const matches = findWebsiteRowsByEmail_(sheet, data.columns, email);
  const links = [];
  matches.forEach((match) => {
    const token = createManageToken_();
    sheet.getRange(match.rowNumber, data.columns['Manage Token Hash'] + 1).setValue(token.hash);
    const date = match.row[data.columns['Timestamp']] || '';
    const church = normalizeText_(match.row[data.columns['Church or Organization']], 160) || 'Unspecified organization';
    const url = getManagementUrl_(token.raw, parameters.manageBaseUrl);
    if (url) links.push(church + ' | ' + date + '\n' + url);
  });
  if (links.length) sendManagementEmail_(email, links);
  return jsonResponse({
    status: 'ok',
    message: 'If a registration exists for that email address, a management link has been sent.'
  });
}

function findRegistrationByManageToken_(sheet, columns, token) {
  if (!token || token.length > 300 || columns['Manage Token Hash'] === undefined || sheet.getLastRow() < 2) return null;
  const hash = hashPassword_(token);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][columns['Manage Token Hash']] || '') === hash) {
      return { row: values[index], rowNumber: index + 2 };
    }
  }
  return null;
}

function handleLoadRegistration_(parameters) {
  const sheet = ensureWebsiteRegistrationsSheet_();
  const data = getSheetData_(WEBSITE_SHEET_NAME);
  const match = findRegistrationByManageToken_(sheet, data.columns, String(parameters.token || ''));
  if (!match) return jsonResponse({ status: 'error', code: 'INVALID_MANAGE_TOKEN' });
  return jsonResponse({ status: 'ok', registration: getWebsiteRegistrationFromRow_(match.row, data.columns) });
}

function validateUpdateParameters_(parameters) {
  const fields = {
    fullName: normalizeText_(parameters.fullName, 120),
    phone: normalizeText_(parameters.phone, 40),
    email: normalizeText_(parameters.email, 160),
    church: normalizeText_(parameters.church, 160)
  };
  const numberAttending = parseNumberAttending_(parameters.numberAttending);
  if (!fields.fullName || !fields.phone || !fields.email || !fields.church || numberAttending === null ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
      Object.keys(fields).some((key) => containsMarkup_(fields[key]))) return null;
  const attendeeNames = [];
  for (let index = 1; index <= numberAttending; index += 1) {
    const name = normalizeText_(parameters['attendee' + index], 120);
    if (!name || containsMarkup_(name)) return null;
    attendeeNames.push(name);
  }
  return { fields: fields, numberAttending: numberAttending, attendeeNames: attendeeNames };
}

function handleRegistrationUpdate_(parameters) {
  if (isRegistrationClosed_()) return jsonResponse({ status: 'error', code: 'REGISTRATION_CLOSED' });
  const validated = validateUpdateParameters_(parameters);
  if (!validated) return jsonResponse({ status: 'error', code: 'VALIDATION_ERROR' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureWebsiteRegistrationsSheet_();
    const data = getSheetData_(WEBSITE_SHEET_NAME);
    const match = findRegistrationByManageToken_(sheet, data.columns, String(parameters.token || ''));
    if (!match) return jsonResponse({ status: 'error', code: 'INVALID_MANAGE_TOKEN' });
    const previous = getWebsiteRegistrationFromRow_(match.row, data.columns);
    const rowValues = match.row.slice();
    rowValues[data.columns['Full Name']] = validated.fields.fullName;
    rowValues[data.columns['Phone Number']] = validated.fields.phone;
    rowValues[data.columns['Email Address']] = validated.fields.email;
    rowValues[data.columns['Church or Organization']] = validated.fields.church;
    rowValues[data.columns['Number Attending']] = validated.numberAttending;
    for (let index = 1; index <= 10; index += 1) {
      rowValues[data.columns['Attendee ' + index]] = validated.attendeeNames[index - 1] || '';
    }
    rowValues[data.columns['Total Attendees']] = validated.numberAttending;
    rowValues[data.columns['Updated At']] = new Date();
    sheet.getRange(match.rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    const logSheet = ensureChangeLogSheet_();
    logSheet.appendRow([new Date(), match.row[data.columns['Submission ID']], previous.numberAttending,
      validated.numberAttending, previous.church, validated.fields.church, 'Registration Updated']);
    return jsonResponse({ status: 'ok', registration: { totalAttendees: validated.numberAttending } });
  } catch (error) {
    console.error(error);
    return jsonResponse({ status: 'error', code: 'SERVER_ERROR' });
  } finally {
    lock.releaseLock();
  }
}

function validateRegistrationParameters_(parameters) {
  const fields = {
    submissionId: normalizeText_(parameters.submissionId, 100),
    fullName: normalizeText_(parameters.fullName, 120),
    phone: normalizeText_(parameters.phone, 40),
    email: normalizeText_(parameters.email, 160),
    church: normalizeText_(parameters.church, 160)
  };
  const numberAttending = parseNumberAttending_(parameters.numberAttending);
  const invalid = !fields.submissionId || !fields.fullName || !fields.phone || !fields.email || !fields.church ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
    Object.keys(fields).some((key) => containsMarkup_(fields[key]));
  if (invalid || numberAttending === null) return null;
  const attendeeNames = [];
  for (let index = 1; index <= numberAttending; index += 1) {
    const attendeeName = normalizeText_(parameters['attendee' + index], 120);
    if (!attendeeName || containsMarkup_(attendeeName)) return null;
    attendeeNames.push(attendeeName);
  }
  return { fields: fields, numberAttending: numberAttending, attendeeNames: attendeeNames };
}

function findSubmissionId_(sheet, columns, submissionId) {
  const idColumn = columns['Submission ID'];
  if (idColumn === undefined || sheet.getLastRow() < 2) return false;
  const ids = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).getValues();
  return ids.some((row) => String(row[0]).trim() === submissionId);
}

function hasExistingContact_(sheet, columns, email, phone) {
  const emailColumn = columns['Email Address'];
  const phoneColumn = columns['Phone Number'];
  if (emailColumn === undefined || phoneColumn === undefined || sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const normalizedEmail = normalizeEmail_(email);
  const normalizedPhone = normalizePhone_(phone);
  return rows.some((row) => normalizeEmail_(row[emailColumn]) === normalizedEmail &&
    normalizePhone_(row[phoneColumn]) === normalizedPhone);
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
      return jsonResponse({ status: 'ok', code: 'DUPLICATE_SUBMISSION', registration: { totalAttendees: validated.numberAttending } });
    }
    if (hasExistingContact_(sheet, data.columns, validated.fields.email, validated.fields.phone)) {
      return jsonResponse({ status: 'error', code: 'EXISTING_REGISTRATION' });
    }
    const row = WEBSITE_HEADERS.map((header) => {
      if (header === 'Timestamp') return new Date();
      if (header === 'Submission ID') return validated.fields.submissionId;
      if (header === 'Full Name') return validated.fields.fullName;
      if (header === 'Phone Number') return validated.fields.phone;
      if (header === 'Email Address') return validated.fields.email;
      if (header === 'Church or Organization') return validated.fields.church;
      if (header === 'Number Attending') return validated.numberAttending;
      if (/^Attendee \d+$/.test(header)) return validated.attendeeNames[Number(header.slice(9)) - 1] || '';
      if (header === 'Total Attendees') return validated.numberAttending;
      return '';
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, WEBSITE_HEADERS.length).setValues([row]);
    return jsonResponse({ status: 'ok', registration: { totalAttendees: validated.numberAttending } });
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

function handleDashboardRefresh_(parameters) {
  if (!hasOrganizerSession_(parameters.token)) {
    return jsonResponse({ status: 'error', code: 'UNAUTHORIZED' });
  }
  return jsonResponse({ status: 'ok', dashboard: refreshPrivateDashboard() });
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
    numberAttending: getSafeAttendeeValue_(row[responseData.columns['Number Attending']]),
    totalAttendees: getSafeAttendeeValue_(row[responseData.columns['Number Attending']]),
    attendeeNames: [],
    source: 'legacy',
    timestamp: row[responseData.columns['Timestamp']] || '',
    isValid: true,
    validationIssues: []
  }));
}

function buildWebsiteRecords_() {
  const responseData = getSheetData_(WEBSITE_SHEET_NAME);
  if (!responseData.sheet) return [];
  return responseData.rows.filter((row) => !isBlankRow_(row)).map((row) => {
    const numberAttending = getSafeAttendeeValue_(row[responseData.columns['Number Attending']]);
    const attendeeNames = [];
    for (let index = 1; index <= 10; index += 1) {
      const value = normalizeText_(row[responseData.columns['Attendee ' + index]], 120);
      if (value) attendeeNames.push(value);
    }

    let isValid = true;
    let validationIssues = [];
    if (numberAttending < 1 || numberAttending > 10 || !Number.isInteger(numberAttending)) {
      isValid = false;
      validationIssues.push("Number Attending must be between 1 and 10.");
    }

    return {
      fullName: normalizeText_(row[responseData.columns['Full Name']], 120),
      phone: normalizeText_(row[responseData.columns['Phone Number']], 40),
      email: normalizeText_(row[responseData.columns['Email Address']], 160),
      church: normalizeText_(row[responseData.columns['Church or Organization']], 160),
      numberAttending: numberAttending,
      totalAttendees: numberAttending,
      attendeeNames: attendeeNames,
      source: 'website',
      timestamp: row[responseData.columns['Timestamp']] || '',
      isValid: isValid,
      validationIssues: validationIssues
    };
  });
}

function getNormalizedRecords_() {
  ensureWebsiteRegistrationsSheet_();
  return buildLegacyRecords_().concat(buildWebsiteRecords_());
}

function buildPrivateReport_() {
  ensureWebsiteRegistrationsSheet_();
  const records = getNormalizedRecords_();
  const churchGroups = {};
  let registrations = 0;
  let attendees = 0;

  const validRecords = records.filter(r => r.isValid !== false);
  const invalidRecords = records.filter(r => r.isValid === false);

  validRecords.forEach((record) => {
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
      churches: groups.length,
      needsReview: invalidRecords.length
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
  const invalidRecords = report.registrations.filter(r => r.isValid === false);

  dashboard.clear();
  dashboard.getRange('A1').setValue('Annual Intercultural Pastors Appreciation Dinner');
  dashboard.getRange('A2').setValue('Private Registration Dashboard');
  dashboard.getRange('A4:B8').setValues([
    ['Valid Registrations', report.summary.registrations],
    ['Total Attendees', report.summary.attendees],
    ['Churches / Organizations Represented', groups.length],
    ['Needs Review', report.summary.needsReview],
    ['Last Updated', new Date()]
  ]);
  dashboard.getRange('A11:C11').setValues([[
    'Church / Organization',
    'Registrations',
    'Total Attendees'
  ]]);

  if (groups.length > 0) {
    dashboard.getRange(12, 1, groups.length, 3).setValues(
      groups.map((group) => [group.name, group.registrations, group.attendees])
    );
  }

  let nextRow = 12 + groups.length + 2;
  if (invalidRecords.length > 0) {
    dashboard.getRange(nextRow, 1).setValue('NEEDS REVIEW').setFontWeight('bold').setFontSize(14).setFontColor('#ff0000');
    dashboard.getRange(nextRow + 1, 1, 1, 4).setValues([[
      'Full Name',
      'Church / Organization',
      'Number Attending',
      'Issue'
    ]]).setFontWeight('bold').setBackground('#ffebee').setBorder(true, true, true, true, true, true);

    dashboard.getRange(nextRow + 2, 1, invalidRecords.length, 4).setValues(
      invalidRecords.map(r => [r.fullName, r.church, r.numberAttending, r.validationIssues.join(', ')])
    ).setBorder(true, true, true, true, true, true);
  }

  dashboard.getRange('A1:D1').setFontWeight('bold').setFontSize(16);
  dashboard.getRange('A2:D2').setFontWeight('bold').setFontSize(12);
  dashboard.getRange('A4:B8')
    .setBackground('#f1f3f4')
    .setBorder(true, true, true, true, true, true);
  dashboard.getRange('A4:A8').setFontWeight('bold');
  dashboard.getRange('B4:B7').setFontWeight('bold').setNumberFormat('0');
  dashboard.getRange('B8').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  dashboard.getRange('A11:C11')
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#174f50')
    .setBorder(true, true, true, true, true, true);
  if (groups.length > 0) {
    dashboard.getRange(12, 1, groups.length, 3)
      .setBorder(true, true, true, true, true, true)
      .setNumberFormat('0');
    dashboard.getRange(12, 1, groups.length, 1).setNumberFormat('@');
  }
  dashboard.setFrozenRows(11);
  dashboard.setColumnWidth(1, 280);
  dashboard.setColumnWidth(2, 130);
  dashboard.setColumnWidth(3, 140);
  dashboard.setColumnWidth(4, 250);
  dashboard.getRange('A1:C8').setHorizontalAlignment('left');
  dashboard.getRange('B4:C1000').setHorizontalAlignment('right');

  return {
    registrations: report.summary.registrations,
    attendees: report.summary.attendees,
    churches: report.summary.churches,
    needsReview: report.summary.needsReview
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