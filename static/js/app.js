import { api } from './api.js';
import { router } from './router.js';
import { renderLoginPage } from './auth.js';
import { renderFeed } from './pages/feed.js';
import { renderPost } from './pages/post.js';
import { renderCreatePost } from './pages/createPost.js';
import { renderProfile } from './pages/profile.js';
import { renderChat } from './pages/chat.js';
import { renderNotifications } from './pages/notifications.js';
import { ws } from './websocket.js';
import { initUsersManager } from './components/UsersManager.js';
import { createParticles } from './utils.js';

function authGuard() {
    return window.__isAuthenticated === true;
}

function guestGuard() {
    if (window.__isAuthenticated === true) {
        router.navigate('feed');
        return false;
    }
    return true;
}

async function init() {
    
    createParticles();

    try {
        const res = await api.me();
        window.__user = res.data;
        window.__isAuthenticated = true;
        
        // Register WebSocket listeners BEFORE connecting,
        // otherwise initial user_status events are dropped.
        initUsersManager();
        ws.connect();
    } catch {
        window.__isAuthenticated = false;
    }

    router.addRoute('login', (app) => {
        renderLoginPage(app);
    }, guestGuard);

    router.addRoute('register', (app) => {
        renderLoginPage(app);
    }, guestGuard);

    router.addRoute('feed', (app, params, queryString) => {
        renderFeed(app, params, queryString);
    }, authGuard);

    router.addRoute('post/:id', (app, params) => {
        renderPost(app, params);
    }, authGuard);

    router.addRoute('create', (app) => {
        renderCreatePost(app);
    }, authGuard);

    router.addRoute('chat', (app, params, queryString) => {
        renderChat(app, params, queryString);
    }, authGuard);

    router.addRoute('chat/:userId', (app, params, queryString) => {
        renderChat(app, params, queryString);
    }, authGuard);

    router.addRoute('notifications', (app) => {
        renderNotifications(app);
    }, authGuard);

    router.addRoute('profile', (app) => {
        renderProfile(app);
    }, authGuard);

    router.start();

    
    if (window.__isAuthenticated) {
        initNotificationBadge();
    }
}

async function initNotificationBadge() {
    try {
        const res = await api.getUnreadCount();
        const count = res.data?.count || 0;
        updateGlobalBadge(count);
    } catch (err) {
        console.error('Failed to load unread count:', err);
    }

    
    if (!window._globalNotifCleanup) {
        window._globalNotifCleanup = ws.on('notification', (payload) => {
            if (!payload) return;
            
            window.__unreadNotifCount = (window.__unreadNotifCount || 0) + 1;
            updateGlobalBadge(window.__unreadNotifCount);
        });
    }
}

function updateGlobalBadge(count) {
    window.__unreadNotifCount = count;

    
    const sidebarNavItem = document.querySelector('.sidebar-nav-item[data-route="notifications"]');
    if (sidebarNavItem) {
        let badgeEl = sidebarNavItem.querySelector('.nav-badge');
        if (count > 0) {
            if (!badgeEl) {
                badgeEl = document.createElement('span');
                badgeEl.className = 'nav-badge';
                sidebarNavItem.appendChild(badgeEl);
            }
            badgeEl.textContent = count > 99 ? '99+' : count;
            badgeEl.style.display = '';
        } else if (badgeEl) {
            badgeEl.style.display = 'none';
        }
    }

    
    const bottomNavItem = document.querySelector('#bottom-nav .nav-item[data-route="notifications"]');
    if (bottomNavItem) {
        let bottomBadge = bottomNavItem.querySelector('.nav-badge');
        if (count > 0) {
            if (!bottomBadge) {
                bottomBadge = document.createElement('span');
                bottomBadge.className = 'nav-badge';
                bottomNavItem.appendChild(bottomBadge);
            }
            bottomBadge.textContent = count > 99 ? '99+' : count;
            bottomBadge.style.display = '';
        } else if (bottomBadge) {
            bottomBadge.style.display = 'none';
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}