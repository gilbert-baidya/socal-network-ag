const REGISTRATION_CLOSE_DATE = new Date('2026-10-06T00:00:00');
// Paste the deployed Google Apps Script URL ending in /exec here.
const ATTENDANCE_API_URL = 'https://script.google.com/macros/s/AKfycbwDfRTppas7K0JyGE0JsUYb72oSEKCcFPPQOlQZQwVhfM6HrY3SCZoh3DUekg7wVNzM/exec';
const ORGANIZER_SESSION_KEY = 'socalOrganizerSession';
const ORGANIZER_SESSION_SECONDS = 1800;
let activeManageToken = null;
let manageMode = false;

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
        attendeeCell.dataset.label = 'Total Attendees';
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
        appendReportValue(card, 'Number Attending', registration.numberAttending);
        appendReportValue(card, 'Total Attendees', registration.totalAttendees);
        appendReportValue(card, 'Source', registration.source === 'legacy' ? 'Legacy Google Form' : 'Website RSVP');
        const attendees = document.createElement('div');
        attendees.className = 'registration-card-attendees';
        const attendeeLabel = document.createElement('strong');
        attendeeLabel.textContent = 'Attendee Names';
        attendees.append(attendeeLabel);
        if (Array.isArray(registration.attendeeNames) && registration.attendeeNames.length) {
            const list = document.createElement('ol');
            registration.attendeeNames.forEach((name) => {
                const item = document.createElement('li');
                item.textContent = name;
                list.append(item);
            });
            attendees.append(list);
        } else {
            const empty = document.createElement('p');
            empty.textContent = 'Not collected on legacy registration';
            attendees.append(empty);
        }
        card.append(attendees);
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

function renderAttendeeFields(numberAttending) {
    const attendeeFields = document.querySelector('#attendee-fields');
    if (!attendeeFields) {
        return;
    }
    const existingNames = Array.from(attendeeFields.querySelectorAll('input')).map((input) => input.value);
    attendeeFields.replaceChildren();
    for (let index = 0; index < numberAttending; index += 1) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        label.textContent = `Attendee ${index + 1} Full Name *`;
        label.htmlFor = `attendee-${index + 1}`;
        input.id = `attendee-${index + 1}`;
        input.name = `attendee${index + 1}`;
        input.type = 'text';
        input.autocomplete = 'off';
        input.maxLength = 120;
        input.required = true;
        input.value = existingNames[index] || '';
        attendeeFields.append(label, input);
    }
}

function collectRegistrationFormData(form) {
    const formData = new FormData(form);
    const numberAttending = Number(formData.get('numberAttending'));
    const parameters = {
        action: manageMode ? 'updateRegistration' : 'register',
        submissionId: createSubmissionId(),
        fullName: String(formData.get('fullName') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        church: String(formData.get('church') || '').trim(),
        numberAttending: String(numberAttending),
        website: String(formData.get('website') || '')
    };
    if (manageMode && activeManageToken) {
        parameters.token = activeManageToken;
    }
    for (let index = 1; index <= numberAttending; index += 1) {
        parameters[`attendee${index}`] = String(formData.get(`attendee${index}`) || '').trim();
    }
    return parameters;
}

function setManageMessage(message, state) {
    const element = document.querySelector('#manage-link-message');
    if (!element) return;
    element.textContent = message;
    element.className = `organizer-message${state ? ` is-${state}` : ''}`;
}

function openManageDialog() {
    const dialog = document.querySelector('#manage-dialog');
    if (!dialog) return;
    setManageMessage('', '');
    document.querySelector('#manage-email').value = '';
    dialog.showModal();
    document.querySelector('#manage-email').focus();
}

async function handleManageLinkRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = document.querySelector('#manage-link-submit');
    const email = String(new FormData(form).get('email') || '').trim();
    if (!form.checkValidity()) {
        form.querySelector(':invalid')?.focus();
        return;
    }
    submitButton.disabled = true;
    setManageMessage('Requesting your secure link...', 'loading');
    try {
        const response = await fetch(ATTENDANCE_API_URL, {
            method: 'POST',
            body: new URLSearchParams({
                action: 'requestManageLink',
                email,
                manageBaseUrl: window.location.origin + window.location.pathname
            })
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'ok') throw new Error(data.code || 'SERVER_ERROR');
        setManageMessage('If a registration exists for that email address, a management link has been sent.', '');
    } catch (error) {
        setManageMessage('We could not process your request right now. Please try again.', 'error');
    } finally {
        submitButton.disabled = false;
    }
}

function populateManagedRegistration(registration) {
    document.querySelector('#full-name').value = registration.fullName || '';
    document.querySelector('#phone-number').value = registration.phone || '';
    document.querySelector('#email-address').value = registration.email || '';
    document.querySelector('#church').value = registration.church || '';
    const attendeeCount = document.querySelector('#attendee-count');
    attendeeCount.value = String(registration.numberAttending);
    renderAttendeeFields(registration.numberAttending);
    registration.attendeeNames.forEach((name, index) => {
        const input = document.querySelector(`#attendee-${index + 1}`);
        if (input) input.value = name;
    });
    document.querySelector('#rsvp-title').textContent = 'Manage Registration';
    document.querySelector('#rsvp-submit').textContent = 'Update Registration';
    document.querySelector('#rsvp-status').textContent = 'Your secure registration link is active.';
    document.querySelector('#rsvp').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadManagedRegistration(token) {
    try {
        const response = await fetch(ATTENDANCE_API_URL, {
            method: 'POST',
            body: new URLSearchParams({ action: 'loadRegistration', token })
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'ok' || !data.registration) throw new Error(data.code || 'INVALID_MANAGE_TOKEN');
        activeManageToken = token;
        manageMode = true;
        history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || '#rsvp'}`);
        populateManagedRegistration(data.registration);
    } catch (error) {
        const status = document.querySelector('#rsvp-status');
        status.textContent = error.message === 'INVALID_MANAGE_TOKEN'
            ? 'This management link is invalid or has expired.'
            : 'We could not process your request right now. Please try again.';
        status.className = 'form-status is-error';
        document.querySelector('#rsvp').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    message.textContent = manageMode
        ? `Thank you, ${fullName}. Your registration has been updated. Total attending: ${totalAttendees}.`
        : `Thank you, ${fullName}. Your registration has been received. Total attending: ${totalAttendees}. We look forward to seeing you on Thursday, October 8.`;
    success.hidden = false;
    success.focus();
}

function resetRegistrationForm() {
    const form = document.querySelector('#rsvp-form');
    const success = document.querySelector('#registration-success');
    const attendeeCount = document.querySelector('#attendee-count');
    if (!form || !success || !attendeeCount) {
        return;
    }
    form.reset();
    activeManageToken = null;
    manageMode = false;
    document.querySelector('#rsvp-title').textContent = 'RSVP';
    document.querySelector('#rsvp-submit').textContent = 'Submit Registration';
    attendeeCount.value = '1';
    renderAttendeeFields(1);
    form.dispatchEvent(new CustomEvent('registrationreset'));
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
        const messages = {
            REGISTRATION_CLOSED: 'Registration changes are now closed.',
            EXISTING_REGISTRATION: 'A registration already exists for this contact. Use Manage Registration to make changes.',
            VALIDATION_ERROR: 'Please review the highlighted information.',
            INVALID_MANAGE_TOKEN: 'This management link is invalid or has expired.'
        };
        status.textContent = messages[error.message] || 'We could not process your request right now. Please try again.';
        status.className = 'form-status is-error';
        submitButton.disabled = false;
        submitButton.textContent = manageMode ? 'Update Registration' : 'Submit Registration';
    }
}

function setupRegistrationForm() {
    const form = document.querySelector('#rsvp-form');
    const attendeeCount = document.querySelector('#attendee-count');
    const anotherButton = document.querySelector('#register-another');
    if (!form || !attendeeCount) {
        return;
    }
    for (let count = 1; count <= 10; count += 1) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = String(count);
        attendeeCount.append(option);
    }
    attendeeCount.value = '1';
    renderAttendeeFields(1);
    const fullName = document.querySelector('#full-name');
    let attendeeOneWasEdited = false;
    const syncAttendeeOne = () => {
        const attendeeOne = document.querySelector('#attendee-1');
        if (attendeeOne && !attendeeOneWasEdited) {
            attendeeOne.value = fullName.value;
        }
    };
    attendeeCount.addEventListener('change', () => {
        renderAttendeeFields(Number(attendeeCount.value));
        syncAttendeeOne();
    });
    fullName.addEventListener('input', syncAttendeeOne);
    document.querySelector('#attendee-fields').addEventListener('input', (event) => {
        if (event.target.id === 'attendee-1') {
            attendeeOneWasEdited = true;
        }
    });
    form.addEventListener('registrationreset', () => {
        attendeeOneWasEdited = false;
        syncAttendeeOne();
    });
    syncAttendeeOne();
    form.addEventListener('submit', handleRegistrationSubmit);
    anotherButton.addEventListener('click', resetRegistrationForm);
}

function setupManageRegistration() {
    const openButton = document.querySelector('#manage-registration-open');
    const dialog = document.querySelector('#manage-dialog');
    const closeButton = document.querySelector('#manage-dialog-close');
    const form = document.querySelector('#manage-link-form');
    if (!openButton || !dialog || !closeButton || !form) return;
    openButton.addEventListener('click', openManageDialog);
    closeButton.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', handleManageLinkRequest);
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        dialog.close();
    });
    const token = new URLSearchParams(window.location.search).get('manage');
    if (token) loadManagedRegistration(token);
}

function updateRegistrationState() {
    const isClosed = new Date() >= REGISTRATION_CLOSE_DATE;
    const isManageLink = new URLSearchParams(window.location.search).has('manage');
    const formShell = document.querySelector('#form-shell');
    const closedMessage = document.querySelector('#registration-closed');
    const rsvpLinks = document.querySelectorAll('.js-rsvp-link, .nav-cta');

    if (!isClosed || isManageLink) {
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
    setupManageRegistration();
    setupOrganizerAccess();
});