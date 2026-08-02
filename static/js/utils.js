export function getInitials(name) {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function safeUpperCase(text) {
    if (!text) return '';
    return text.toUpperCase();
}

export function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp.replace(' ', 'T') + 'Z');
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? '1 minute ago' : `${diffMins} minutes ago`;
    }
    if (diffHours < 24) {
        return `${diffHours} hours ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
}

export function formatUnixTimestamp(ts) {
    if (!ts) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function createParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;
    
    const count = 12;
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const size = Math.random() * 4 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.bottom = `${Math.random() * 20}%`;
        particle.style.animationDuration = `${Math.random() * 15 + 15}s`;
        particle.style.animationDelay = `${Math.random() * 20}s`;
        
        container.appendChild(particle);
    }
}

export function showInputError(containerId, message) {
    const container = typeof containerId === 'string'
        ? document.getElementById(containerId)
        : containerId;
    if (!container) return;

    
    const existing = container.querySelector('.input-error-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'input-error-banner';
    banner.textContent = message;
    banner.setAttribute('role', 'alert');
    container.appendChild(banner);

    
    banner.offsetHeight;
    banner.style.opacity = '1';

    setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => {
            if (banner.parentNode) banner.remove();
        }, 300);
    }, 5000);
}

export function validateEmail(email) {
    if (!email || !email.trim()) return 'Please enter your email address.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email.trim())) return 'Please enter a valid email address.';
    return null;
}

export function validatePassword(password) {
    if (!password) return 'Please enter a password.';
    if (password.length < 12) return 'Password must be at least 12 characters.';
    if (password.length > 64) return 'Password must be at most 64 characters.';
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9\s]/.test(password);
    if (!hasLetter || !hasNumber || !hasSymbol) {
        return 'Password must contain at least one letter, one number, and one symbol.';
    }
    return null;
}

export function validateLength(value, min, max, fieldName) {
    const trimmed = (value || '').trim();
    if (!trimmed) return `${fieldName} is required.`;
    if (trimmed.length < min) return `${fieldName} must be at least ${min} characters.`;
    if (trimmed.length > max) return `${fieldName} must be at most ${max} characters.`;
    return null;
}

/**
 * Creates a throttled version of a function that only invokes the function
 * at most once per every `wait` milliseconds.
 * @param {Function} fn - The function to throttle.
 * @param {number} wait - The number of milliseconds to throttle invocations to.
 * @returns {Function} The throttled function.
 */
export function throttle(fn, wait) {
    let lastTime = 0;
    let timeoutId = null;
    let lastArgs = null;

    function invoke() {
        lastTime = Date.now();
        timeoutId = null;
        fn.apply(this, lastArgs);
    }

    const throttled = function (...args) {
        const now = Date.now();
        const remaining = wait - (now - lastTime);
        lastArgs = args;

        if (remaining <= 0) {
            
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastTime = now;
            fn.apply(this, args);
        } else if (!timeoutId) {
            
            timeoutId = setTimeout(() => {
                invoke.call(this);
            }, remaining);
        }
    };

    throttled.cancel = function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastTime = 0;
        lastArgs = null;
    };

    return throttled;
}