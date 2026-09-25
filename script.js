const REGISTRATION_CLOSE_DATE = new Date('2026-10-06T00:00:00');
// Paste the deployed Google Apps Script URL ending in /exec here.
const ATTENDANCE_API_URL = 'https://script.google.com/macros/s/AKfycbwDfRTppas7K0JyGE0JsUYb72oSEKCcFPPQOlQZQwVhfM6HrY3SCZoh3DUekg7wVNzM/exec';
const ORGANIZER_SESSION_KEY = 'socalOrganizerSession';
const ORGANIZER_SESSION_SECONDS = 1800;

function clearPrivateReportData() {
    const details = document.querySelector('#registration-details-list');
    const tableBody = document.querySelector('#report-table-body');
    const reportMessage = document.querySelector('#organizer-report-message');

    details?.replaceChildren();
    tableBody?.replaceChildren();
    setOrganizerMessage(reportMessage, '', '');

    ['#report-registrations', '#report-attendees', '#report-churches'].forEach((selector) => {
        const summaryValue = document.querySelector(selector);
        if (summaryValue) {
            summaryValue.textContent = '\u2014';
        }
    });
}

function createSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `submission-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidAttendanceTotal(value) {
    return Number.isFinite(value) && value >= 0;
}

async function loadAttendanceStats() {
    try {
        const response = await fetch(ATTENDANCE_API_URL);
        if (!response.ok) {
            throw new Error('Attendance request failed.');
        }

        const data = await response.json();

        if (
            data.status !== 'ok' ||
            !isValidAttendanceTotal(data.registrations) ||
            !isValidAttendanceTotal(data.attendees)
        ) {
            throw new Error('Invalid attendance response.');
        }

        const attendanceCount = document.querySelector('#attendance-count');
        const attendanceStatus = document.querySelector('#attendance-status');
        if (attendanceCount) {
            attendanceCount.textContent = String(data.attendees);
        }
        if (attendanceStatus) {
            const registrationLabel = data.registrations === 1 ? 'registration' : 'registrations';
            attendanceStatus.textContent = `${data.registrations} ${registrationLabel} received`;
        }
    } catch (error) {
        console.warn('Attendance total is currently unavailable.');
    }
}

async function postOrganizerAction(parameters) {
    const body = new URLSearchParams(parameters);
    const response = await fetch(ATTENDANCE_API_URL, {
        method: 'POST',
        body
    });

    if (!response.ok) {
        throw new Error('Organizer request failed.');
    }

    return response.json();
}

function setOrganizerMessage(element, message, state) {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.classList.toggle('is-error', state === 'error');
    element.classList.toggle('is-loading', state === 'loading');
}

function showOrganizerLogin(message) {
    const loginView = document.querySelector('#organizer-login-view');
    const reportView = document.querySelector('#organizer-report-view');
    const loginForm = document.querySelector('#organizer-login-form');
    const loginMessage = document.querySelector('#organizer-login-message');

    if (loginView) {
        loginView.hidden = false;
    }
    if (reportView) {
        reportView.hidden = true;
    }
    if (loginForm) {
        loginForm.reset();
    }
    setOrganizerMessage(loginMessage, message || '', message ? 'error' : '');
}

function showOrganizerReportView() {
    const loginView = document.querySelector('#organizer-login-view');
    const reportView = document.querySelector('#organizer-report-view');

    if (loginView) {
        loginView.hidden = true;
    }
    if (reportView) {
        reportView.hidden = false;
    }
}

function isValidReport(data) {
    return data && data.status === 'ok' && data.summary &&
        Number.isFinite(data.summary.registrations) &&
        Number.isFinite(data.summary.attendees) &&
        Number.isFinite(data.summary.churches) &&
        Array.isArray(data.groups) && Array.isArray(data.registrations);
}

function renderOrganizerReport(data) {
    document.querySelector('#report-registrations').textContent = String(data.summary.registrations);
    document.querySelector('#report-attendees').textContent = String(data.summary.attendees);
    document.querySelector('#report-churches').textContent = String(data.summary.churches);

    const tableBody = document.querySelector('#report-table-body');
    tableBody.replaceChildren();
    data.groups.forEach((group) => {
        if (!group || typeof group.name !== 'string' ||
            !Number.isFinite(group.registrations) || !Number.isFinite(group.attendees)) {
            return;
        }

        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const registrationCell = document.createElement('td');
        const attendeeCell = document.createElement('td');
        nameCell.textContent = group.name;
        registrationCell.textContent = String(group.registrations);
        attendeeCell.textContent = String(group.attendees);
        registrationCell.dataset.label = 'Registrations';
        attendeeCell.dataset.label = 'Guests';
        row.append(nameCell, registrationCell, attendeeCell);
        tableBody.append(row);
    });

    const details = document.querySelector('#registration-details-list');
    if (!details) {
        return;
    }
    details.replaceChildren();
    (Array.isArray(data.registrations) ? data.registrations : []).forEach((registration) => {
        const card = document.createElement('article');
        card.className = 'registration-card';
        const heading = document.createElement('h4');
        heading.textContent = registration.fullName || 'Unnamed registrant';
        const church = document.createElement('p');
        church.className = 'registration-card-church';
        church.textContent = registration.church || 'Unspecified';
        card.append(heading, church);
        appendReportLink(card, 'Phone', registration.phone, 'tel:');
        appendReportLink(card, 'Email', registration.email, 'mailto:');
        appendReportValue(card, 'Number of Guests', registration.guestCount);
        appendReportValue(card, 'Total Attendees', registration.totalAttendees);
        appendReportValue(card, 'Source', registration.source === 'legacy' ? 'Legacy Google Form' : 'Website RSVP');
        const guests = document.createElement('div');
        guests.className = 'registration-card-guests';
        const guestLabel = document.createElement('strong');
        guestLabel.textContent = 'Guest Names';
        guests.append(guestLabel);
        if (Array.isArray(registration.guestNames) && registration.guestNames.length) {
            const list = document.createElement('ol');
            registration.guestNames.forEach((name) => {
                const item = document.createElement('li');
                item.textContent = name;
                list.append(item);
            });
            guests.append(list);
        } else {
            const empty = document.createElement('p');
            empty.textContent = 'Not collected on legacy registration';
            guests.append(empty);
        }
        card.append(guests);
        details.append(card);
    });
}

function appendReportValue(parent, label, value) {
    const row = document.createElement('p');
    const labelElement = document.createElement('strong');
    labelElement.textContent = `${label}: `;
    row.append(labelElement, document.createTextNode(String(value ?? '')));
    parent.append(row);
}

function appendReportLink(parent, label, value, scheme) {
    const row = document.createElement('p');
    const labelElement = document.createElement('strong');
    labelElement.textContent = `${label}: `;
    const link = document.createElement('a');
    link.textContent = String(value || '');
    link.href = `${scheme}${encodeURIComponent(String(value || ''))}`;
    row.append(labelElement, link);
    parent.append(row);
}

async function loadOrganizerReport(message) {
    const token = sessionStorage.getItem(ORGANIZER_SESSION_KEY);
    const reportMessage = document.querySelector('#organizer-report-message');
    const refreshButton = document.querySelector('#organizer-refresh');

    if (!token) {
        clearPrivateReportData();
        showOrganizerLogin(message || 'Your organizer session has expired. Please sign in again.');
        return false;
    }

    showOrganizerReportView();
    setOrganizerMessage(reportMessage, 'Loading report...', 'loading');
    if (refreshButton) {
        refreshButton.disabled = true;
    }

    try {
        const data = await postOrganizerAction({ action: 'report', token });
        if (data.code === 'UNAUTHORIZED') {
            sessionStorage.removeItem(ORGANIZER_SESSION_KEY);
            clearPrivateReportData();
            showOrganizerLogin('Your organizer session has expired. Please sign in again.');
            return false;
        }
        if (!isValidReport(data)) {
            throw new Error('Invalid organizer report.');
        }

        renderOrganizerReport(data);
        setOrganizerMessage(reportMessage, 'Report updated.', '');
        return true;
    } catch (error) {
        setOrganizerMessage(reportMessage, 'The report is currently unavailable. Please try again.', 'error');
        return false;
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
        }
    }
}

async function handleOrganizerLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const signInButton = document.querySelector('#organizer-sign-in');
    const loginMessage = document.querySelector('#organizer-login-message');
    const formData = new FormData(form);

    signInButton.disabled = true;
    signInButton.textContent = 'Signing In...';
    setOrganizerMessage(loginMessage, 'Signing in...', 'loading');

    try {
        const data = await postOrganizerAction({
            action: 'login',
            loginId: String(formData.get('loginId') || '').trim(),
            password: String(formData.get('password') || '')
        });

        if (data.status !== 'ok' || typeof data.token !== 'string' || data.expiresIn !== ORGANIZER_SESSION_SECONDS) {
            setOrganizerMessage(loginMessage, 'Login ID or password is incorrect.', 'error');
            return;
        }

        sessionStorage.setItem(ORGANIZER_SESSION_KEY, data.token);
        await loadOrganizerReport();
    } catch (error) {
        setOrganizerMessage(loginMessage, 'Login ID or password is incorrect.', 'error');
    } finally {
        signInButton.disabled = false;
        signInButton.textContent = 'Sign In';
    }
}

async function handleOrganizerLogout() {
    const token = sessionStorage.getItem(ORGANIZER_SESSION_KEY);

    try {
        if (token) {
            await postOrganizerAction({ action: 'logout', token });
        }
    } catch (error) {
        console.warn('Organizer session could not be closed on the server.');
    } finally {
        sessionStorage.removeItem(ORGANIZER_SESSION_KEY);
        clearPrivateReportData();
        showOrganizerLogin('You have been signed out.');
    }
}

function setupOrganizerAccess() {
    const dialog = document.querySelector('#organizer-dialog');
    const accessButtons = document.querySelectorAll('#organizer-access-button, .js-organizer-access');
    const closeButton = document.querySelector('#organizer-dialog-close');
    const loginForm = document.querySelector('#organizer-login-form');
    const passwordInput = document.querySelector('#organizer-password');
    const passwordToggle = document.querySelector('#show-organizer-password');
    const refreshButton = document.querySelector('#organizer-refresh');
    const logoutButton = document.querySelector('#organizer-logout');

    if (!dialog || !accessButtons.length || !closeButton || !loginForm) {
        return;
    }

    let activeAccessButton = accessButtons[0];
    accessButtons.forEach((accessButton) => accessButton.addEventListener('click', () => {
        activeAccessButton = accessButton;
        dialog.showModal();
        if (sessionStorage.getItem(ORGANIZER_SESSION_KEY)) {
            loadOrganizerReport();
        } else {
            showOrganizerLogin();
        }
        document.querySelector('#organizer-login-id').focus();
    }));
    closeButton.addEventListener('click', () => dialog.close());
    loginForm.addEventListener('submit', handleOrganizerLogin);
    passwordToggle.addEventListener('change', () => {
        passwordInput.type = passwordToggle.checked ? 'text' : 'password';
    });
    refreshButton.addEventListener('click', () => loadOrganizerReport());
    logoutButton.addEventListener('click', handleOrganizerLogout);
    dialog.addEventListener('cancel', (event) => {
        if (!document.querySelector('#organizer-sign-in').disabled && !refreshButton.disabled) {
            event.preventDefault();
            dialog.close();
        }
    });
    dialog.addEventListener('close', () => activeAccessButton.focus());

    const existingToken = sessionStorage.getItem(ORGANIZER_SESSION_KEY);
    if (existingToken) {
        loadOrganizerReport();
    }
}

function renderGuestFields(guestCount) {
    const guestFields = document.querySelector('#guest-fields');
    if (!guestFields) {
        return;
    }
    const existingNames = Array.from(guestFields.querySelectorAll('input')).map((input) => input.value);
    guestFields.replaceChildren();
    for (let index = 0; index < guestCount; index += 1) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        label.textContent = `Guest ${index + 1} Full Name *`;
        label.htmlFor = `guest-${index + 1}`;
        input.id = `guest-${index + 1}`;
        input.name = `guest${index + 1}`;
        input.type = 'text';
        input.autocomplete = 'off';
        input.maxLength = 120;
        input.required = true;
        input.value = existingNames[index] || '';
        guestFields.append(label, input);
    }
}

function collectRegistrationFormData(form) {
    const formData = new FormData(form);
    const guestCount = Number(formData.get('guestCount'));
    const parameters = {
        action: 'register',
        submissionId: createSubmissionId(),
        fullName: String(formData.get('fullName') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        church: String(formData.get('church') || '').trim(),
        guestCount: String(guestCount),
        website: String(formData.get('website') || '')
    };
    for (let index = 1; index <= guestCount; index += 1) {
        parameters[`guest${index}`] = String(formData.get(`guest${index}`) || '').trim();
    }
    return parameters;
}

function validateRegistrationForm(form) {
    const invalidField = form.querySelector(':invalid');
    if (invalidField) {
        invalidField.focus();
        return false;
    }
    return true;
}

function renderRegistrationSuccess(fullName, totalAttendees) {
    const form = document.querySelector('#rsvp-form');
    const success = document.querySelector('#registration-success');
    const message = document.querySelector('#success-message');
    if (!form || !success || !message) {
        return;
    }
    form.hidden = true;
    message.textContent = `Thank you, ${fullName}. Your registration has been received. Total attending: ${totalAttendees}. We look forward to seeing you on Thursday, October 8.`;
    success.hidden = false;
    success.focus();
}

function resetRegistrationForm() {
    const form = document.querySelector('#rsvp-form');
    const success = document.querySelector('#registration-success');
    const guestCount = document.querySelector('#guest-count');
    if (!form || !success || !guestCount) {
        return;
    }
    form.reset();
    guestCount.value = '0';
    renderGuestFields(0);
    form.hidden = false;
    success.hidden = true;
    document.querySelector('#full-name').focus();
}

async function handleRegistrationSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = document.querySelector('#rsvp-submit');
    const status = document.querySelector('#rsvp-status');
    if (!validateRegistrationForm(form)) {
        status.textContent = 'Please complete the highlighted fields.';
        status.className = 'form-status is-error';
        return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    status.textContent = 'Submitting your registration...';
    status.className = 'form-status is-loading';
    try {
        const parameters = collectRegistrationFormData(form);
        const response = await fetch(ATTENDANCE_API_URL, { method: 'POST', body: new URLSearchParams(parameters) });
        const data = await response.json();
        if (!response.ok || data.status !== 'ok' || !data.registration) {
            throw new Error(data.code || 'Registration failed.');
        }
        renderRegistrationSuccess(parameters.fullName, data.registration.totalAttendees);
        loadAttendanceStats();
    } catch (error) {
        status.textContent = error.message === 'REGISTRATION_CLOSED'
            ? 'Registration is now closed.'
            : 'We could not submit your registration. Please try again.';
        status.className = 'form-status is-error';
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Registration';
    }
}

function setupRegistrationForm() {
    const form = document.querySelector('#rsvp-form');
    const guestCount = document.querySelector('#guest-count');
    const anotherButton = document.querySelector('#register-another');
    if (!form || !guestCount) {
        return;
    }
    for (let count = 0; count <= 10; count += 1) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = String(count);
        guestCount.append(option);
    }
    guestCount.value = '0';
    renderGuestFields(0);
    guestCount.addEventListener('change', () => renderGuestFields(Number(guestCount.value)));
    form.addEventListener('submit', handleRegistrationSubmit);
    anotherButton.addEventListener('click', resetRegistrationForm);
}

function updateRegistrationState() {
    const isClosed = new Date() >= REGISTRATION_CLOSE_DATE;
    const formShell = document.querySelector('#form-shell');
    const closedMessage = document.querySelector('#registration-closed');
    const rsvpLinks = document.querySelectorAll('.js-rsvp-link, .nav-cta');

    if (!isClosed) {
        return;
    }

    rsvpLinks.forEach((link) => {
        link.classList.add('is-closed');
        link.setAttribute('aria-disabled', 'true');
        link.addEventListener('click', (event) => event.preventDefault());
    });

    if (formShell && closedMessage) {
        formShell.hidden = true;
        closedMessage.hidden = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateRegistrationState();
    loadAttendanceStats();
    setupRegistrationForm();
    setupOrganizerAccess();
});