/*
 * Setup:
 * 1. Open the Google Sheet.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file into Code.gs and save.
 * 4. Run testAttendanceData() and approve permissions if prompted.
 * 5. Confirm the values in the execution log.
 * 6. Deploy -> New deployment -> Web app.
 * 7. Execute as: Me. Who has access: Anyone.
 * 8. Deploy and copy the URL ending in /exec.
 * 9. Paste that URL into script.js as ATTENDANCE_API_URL.
 */

const RESPONSE_SHEET_NAME = 'Form Responses 1';
const ATTENDANCE_HEADER = 'Number Attending';
const DASHBOARD_SHEET_NAME = 'Dashboard';
const ORGANIZER_SESSION_PREFIX = 'organizer_session_';
const ORGANIZER_SESSION_SECONDS = 1800;
const RESPONSE_HEADERS = [
  'Timestamp',
  'Full Name',
  'Phone Number',
  'Email Address',
  'Church or Organization',
  'Number Attending'
];

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAttendanceData() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(RESPONSE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Response sheet not found.');
  }

  const rows = sheet.getDataRange().getValues();
  if (rows.length === 0) {
    return { registrations: 0, attendees: 0 };
  }

  const headers = rows[0].map((header) => String(header).trim());
  const attendanceColumn = headers.indexOf(ATTENDANCE_HEADER);
  if (attendanceColumn === -1) {
    throw new Error('Attendance column not found.');
  }

  let registrations = 0;
  let attendees = 0;

  rows.slice(1).forEach((row) => {
    const isResponse = row.some((cell) => cell !== '' && cell !== null);
    if (!isResponse) {
      return;
    }

    registrations += 1;
    const value = Number(row[attendanceColumn]);
    if (Number.isFinite(value) && value >= 1 && value <= 10) {
      attendees += value;
    }
  });

  return { registrations, attendees };
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

    return jsonResponse({ status: 'error', code: 'INVALID_ACTION' });
  } catch (error) {
    return jsonResponse({ status: 'error', code: 'SERVER_ERROR' });
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
    groups: report.groups
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

function getResponseData() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(RESPONSE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Response sheet not found.');
  }

  const rows = sheet.getDataRange().getValues();
  if (rows.length === 0) {
    return { rows: [], columns: {} };
  }

  const headers = rows[0].map((header) => String(header).trim());
  const columns = {};
  RESPONSE_HEADERS.forEach((header) => {
    const index = headers.indexOf(header);
    if (index === -1) {
      throw new Error('Response column not found: ' + header);
    }
    columns[header] = index;
  });

  return { rows: rows.slice(1), columns: columns };
}

function getSafeAttendeeValue(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
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

function buildPrivateReport_() {
  const responseData = getResponseData();
  const churchGroups = {};
  let registrations = 0;
  let attendees = 0;

  responseData.rows.forEach((row) => {
    const isResponse = row.some((cell) => cell !== '' && cell !== null);
    if (!isResponse) {
      return;
    }

    registrations += 1;
    const church = normalizeChurchName(row[responseData.columns['Church or Organization']]);
    const group = churchGroups[church.key] || {
      name: church.displayName,
      registrations: 0,
      attendees: 0
    };
    const rowAttendees = getSafeAttendeeValue(row[responseData.columns['Number Attending']]);

    group.registrations += 1;
    group.attendees += rowAttendees;
    churchGroups[church.key] = group;
    attendees += rowAttendees;
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
    groups: groups
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
    ['Expected Guests', report.summary.attendees],
    ['Churches / Organizations Represented', groups.length],
    ['Last Updated', new Date()]
  ]);
  dashboard.getRange('A10:C10').setValues([[
    'Church / Organization',
    'Registrations',
    'Expected Guests'
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
  console.log('Expected Guests: ' + totals.attendees);
  console.log('Churches Represented: ' + totals.churches);
}

function testOrganizerReport() {
  const report = buildPrivateReport_();
  console.log('Total Registrations: ' + report.summary.registrations);
  console.log('Expected Guests: ' + report.summary.attendees);
  console.log('Churches Represented: ' + report.summary.churches);
}