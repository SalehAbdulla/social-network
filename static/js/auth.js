import { api } from './api.js';
import { router } from './router.js';
import { ws } from './websocket.js';
import { validateEmail, validatePassword, validateLength } from './utils.js';

let currentTab = 'login';

export function renderLoginPage(app) {
    app.innerHTML = `
        <div class="auth-container">
            <div class="auth-logo">
                <span>forum</span><span class="dot"></span>
            </div>
            <div class="auth-tabs">
                <button class="auth-tab ${currentTab === 'login' ? 'active' : ''}" data-tab="login">Sign in</button>
                <button class="auth-tab ${currentTab === 'register' ? 'active' : ''}" data-tab="register">Register</button>
            </div>
            <div class="auth-title">${currentTab === 'login' ? 'Sign in to your account' : 'Create your account'}</div>
            <div id="auth-error" class="error-message" style="display: none;"></div>
            <form id="auth-form" class="auth-form">
                ${currentTab === 'login' ? getLoginFields() : getRegisterFields()}
            </form>
            <button type="submit" form="auth-form" class="btn-submit">${currentTab === 'login' ? 'Sign in' : 'Register'}</button>
            <div class="auth-footer">
                <span>${currentTab === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
                <a id="auth-switch">${currentTab === 'login' ? 'Register' : 'Sign in'}</a>
            </div>
            ${currentTab === 'login' ? `
            <div class="remember-me">
                <input type="checkbox" id="remember-me">
                <label for="remember-me">Remember Me</label>
            </div>` : ''}
        </div>
    `;

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            renderLoginPage(app);
        });
    });

    document.getElementById('auth-switch').addEventListener('click', (e) => {
        e.preventDefault();
        currentTab = currentTab === 'login' ? 'register' : 'login';
        renderLoginPage(app);
    });

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('auth-error');
        errorEl.style.display = 'none';

        const btn = document.querySelector('.btn-submit');
        btn.disabled = true;
        btn.textContent = 'Loading...';

        try {
            if (currentTab === 'login') {
                await handleLogin();
            } else {
                await handleRegister();
            }
        } catch (err) {
            errorEl.textContent = err.error || err.message || 'An error occurred';
            errorEl.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = currentTab === 'login' ? 'Sign in' : 'Register';
        }
    });
}

function getLoginFields() {
    return `
        <div class="form-group">
            <input type="text" name="identifier" class="form-input" placeholder="Email / Username" autocomplete="username" required>
        </div>
        <div class="form-group">
            <input type="password" name="password" class="form-input" placeholder="Password" autocomplete="current-password" required>
        </div>
    `;
}

function getRegisterFields() {
    return `
        <div class="form-group">
            <input type="text" name="nickName" class="form-input" placeholder="Nickname" minlength="2" maxlength="33" autocomplete="username" required>
        </div>
        <div class="form-group">
            <input type="email" name="email" class="form-input" placeholder="Email" autocomplete="email" required>
        </div>
        <div class="form-group">
            <input type="text" name="firstName" class="form-input" placeholder="First Name" minlength="1" maxlength="50" autocomplete="given-name" required>
        </div>
        <div class="form-group">
            <input type="text" name="lastName" class="form-input" placeholder="Last Name" minlength="1" maxlength="50" autocomplete="family-name" required>
        </div>
        <div class="form-group">
            <input type="password" name="password" class="form-input" placeholder="Password" minlength="8" autocomplete="new-password" required>
        </div>
        <div class="form-group">
            <input type="password" name="confirmPassword" class="form-input" placeholder="Confirm Password" minlength="8" autocomplete="new-password" required>
        </div>
        <div class="form-group">
            <input type="number" name="age" class="form-input" placeholder="Age" min="1" max="100" required>
        </div>
        <div class="form-group">
            <select name="gender" class="form-input" required>
                <option value="" disabled selected>Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
            </select>
        </div>
    `;
}

async function handleLogin() {
    const form = document.getElementById('auth-form');
    const errorEl = document.getElementById('auth-error');
    const identifier = form.querySelector('[name="identifier"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const rememberMe = document.getElementById('remember-me')?.checked || false;

    
    if (!identifier) {
        errorEl.textContent = 'Please enter your email or username.';
        errorEl.style.display = 'block';
        return;
    }
    if (!password) {
        errorEl.textContent = 'Please enter your password.';
        errorEl.style.display = 'block';
        return;
    }

    const res = await api.login(identifier, password, rememberMe);
    window.__isAuthenticated = true;
    
    try {
        const me = await api.me();
        window.__user = me.data;
    } catch {}
    
    ws.connect();
    router.navigate('feed');
}

async function handleRegister() {
    const form = document.getElementById('auth-form');
    const errorEl = document.getElementById('auth-error');

    const fields = {
        nickName: form.querySelector('[name="nickName"]').value.trim(),
        email: form.querySelector('[name="email"]').value.trim(),
        firstName: form.querySelector('[name="firstName"]').value.trim(),
        lastName: form.querySelector('[name="lastName"]').value.trim(),
        password: form.querySelector('[name="password"]').value,
        confirmPassword: form.querySelector('[name="confirmPassword"]').value,
        age: form.querySelector('[name="age"]').value.trim(),
        gender: form.querySelector('[name="gender"]').value.trim().toLowerCase(),
    };

    
    const nickErr = validateLength(fields.nickName, 2, 33, 'Username');
    if (nickErr) {
        errorEl.textContent = nickErr;
        errorEl.style.display = 'block';
        return;
    }

    const emailErr = validateEmail(fields.email);
    if (emailErr) {
        errorEl.textContent = emailErr;
        errorEl.style.display = 'block';
        return;
    }

    const firstNameErr = validateLength(fields.firstName, 1, 50, 'First name');
    if (firstNameErr) {
        errorEl.textContent = firstNameErr;
        errorEl.style.display = 'block';
        return;
    }

    const lastNameErr = validateLength(fields.lastName, 1, 50, 'Last name');
    if (lastNameErr) {
        errorEl.textContent = lastNameErr;
        errorEl.style.display = 'block';
        return;
    }

    const pwErr = validatePassword(fields.password);
    if (pwErr) {
        errorEl.textContent = pwErr;
        errorEl.style.display = 'block';
        return;
    }

    if (fields.password !== fields.confirmPassword) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
        return;
    }

    const ageNum = parseInt(fields.age, 10);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 100) {
        errorEl.textContent = 'Please enter a valid age between 1 and 100.';
        errorEl.style.display = 'block';
        return;
    }

    if (fields.gender !== 'male' && fields.gender !== 'female') {
        errorEl.textContent = 'Gender must be either "male" or "female".';
        errorEl.style.display = 'block';
        return;
    }

    const res = await api.register(fields);
    window.__isAuthenticated = true;
    
    try {
        const me = await api.me();
        window.__user = me.data;
    } catch {}
    
    ws.connect();
    router.navigate('feed');
}
