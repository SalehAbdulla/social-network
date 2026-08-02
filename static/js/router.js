import { renderAllUserLists, getUsers } from './components/UsersManager.js';

class Router {
    constructor() {
        this.routes = {};
        this.guards = {};
        this.currentRoute = null;

        window.addEventListener('popstate', () => this.resolve());
    }

    addRoute(pattern, handler, guard = null) {
        this.routes[pattern] = handler;
        if (guard) {
            this.guards[pattern] = guard;
        }
    }

    navigate(path) {
        history.pushState(null, '', '/' + path);
        this.resolve();
    }

    async resolve() {
        if (typeof window.__pageTeardown === 'function') {
            try { window.__pageTeardown(); } catch (e) { console.error('[Router] Page teardown error:', e); }
            window.__pageTeardown = null;
        }

        if (window.location.hash && window.location.hash.startsWith('#')) {
            const hashPath = window.location.hash.slice(1);
            history.replaceState(null, '', '/' + hashPath);
        }

        const pathname = window.location.pathname;
        let path = pathname.slice(1) || (window.__isAuthenticated ? 'feed' : 'login');
        let [cleanPath, ...rest] = path.split('?');
        
        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.slice(1);
        }
        const queryString = rest.join('?');
        const params = {};

        for (const pattern in this.routes) {
            const match = this.matchRoute(pattern, cleanPath);
            if (match) {
                const guard = this.guards[pattern];
                if (guard && !guard()) {
                    this.navigate('');
                    return;
                }

                this.currentRoute = pattern;
                const app = document.getElementById('app');

                if (cleanPath === 'login' || cleanPath === 'register') {
                    app.innerHTML = `<div id="app-content"></div>`;
                    const content = document.getElementById('app-content');
                    this.routes[pattern](content, match.params, queryString);
                    return;
                }

                const name = window.__user ? (window.__user.nickname || window.__user.firstName || 'User') : 'User';
                const initials = name.substring(0, 2).toUpperCase();

                app.innerHTML = `
                    <div class="app-frame">
                        <div class="app-inner">
                            <div class="app-sidebar">
                                <div class="sidebar-logo">
                                    <span>forum</span><span class="logo-dot"></span>
                                </div>
                                <nav class="sidebar-nav">
                                    <button class="sidebar-nav-item ${cleanPath === 'feed' ? 'active' : ''}" data-route="feed">
                                        <svg viewBox="0 0 20 20" fill="none">
                                            <path d="M2 10L10 2L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                            <path d="M4 8V16H16V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                        Home
                                    </button>
                                    <button class="sidebar-nav-item ${cleanPath === 'chat' ? 'active' : ''}" data-route="chat">
                                        <svg viewBox="0 0 20 20" fill="none">
                                            <path d="M2 4C2 3.44772 2.44772 3 3 3H17C17.5523 3 18 3.44772 18 4V14C18 14.5523 17.5523 15 17 15H6L3 18V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                        Chat
                                    </button>
                                    <button class="sidebar-nav-item ${cleanPath === 'notifications' ? 'active' : ''}" data-route="notifications">
                                        <svg viewBox="0 0 20 20" fill="none">
                                            <path d="M10 2C7.79086 2 6 3.79086 6 6V9C6 9.55228 5.55228 10 5 10H4V12H16V10H15C14.4477 10 14 9.55228 14 9V6C14 3.79086 12.2091 2 10 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                            <path d="M8 14V15C8 16.1046 8.89543 17 10 17C11.1046 17 12 16.1046 12 15V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                        Notifications
                                    </button>
                                </nav>
                                <div class="sidebar-categories">
                                    <span class="sidebar-categories-label">Categories</span>
                                    <div class="sidebar-categories-list">
                                        <button class="sidebar-cat-pill active" data-category="all">All</button>
                                        <button class="sidebar-cat-pill" data-category="1">Tech</button>
                                        <button class="sidebar-cat-pill" data-category="2">General</button>
                                        <button class="sidebar-cat-pill" data-category="3">Dev</button>
                                        <button class="sidebar-cat-pill" data-category="4">Gaming</button>
                                        <button class="sidebar-cat-pill" data-category="5">Q&A</button>
                                        <button class="sidebar-cat-pill" data-category="6">Random</button>
                                        <button class="sidebar-cat-pill" data-category="7">Life</button>
                                        <button class="sidebar-cat-pill" data-category="8">Sport</button>
                                    </div>
                                </div>
                                <div class="sidebar-profile" id="sidebar-profile">
                                    <div class="sidebar-profile-avatar">${initials}</div>
                                    <div class="sidebar-profile-info">
                                        <span class="sidebar-profile-name">${name}</span>
                                        <span class="sidebar-profile-status">Online</span>
                                    </div>
                                </div>
                            </div>
                            <div class="app-panel" id="app-panel"></div>
                            <button class="fab-create" id="fab-create" aria-label="Create Post" style="display:none;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                    <path d="M12 4V20M4 12H20"/>
                                </svg>
                            </button>
                            <nav class="bottom-nav" id="bottom-nav">
                                <button class="nav-item active" data-route="feed" aria-label="Home">
                                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                        <path d="M2 10L10 2L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M4 8V16H16V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                                <button class="nav-item" data-route="notifications" aria-label="Notifications">
                                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 2C7.79086 2 6 3.79086 6 6V9C6 9.55228 5.55228 10 5 10H4V12H16V10H15C14.4477 10 14 9.55228 14 9V6C14 3.79086 12.2091 2 10 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M8 14V15C8 16.1046 8.89543 17 10 17C11.1046 17 12 16.1046 12 15V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                    <span class="nav-badge nav-badge--bottom" style="display:none;"></span>
                                </button>
                                <button class="nav-item" data-route="profile" aria-label="Profile">
                                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                        <circle cx="10" cy="6" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                        <path d="M2 18C2 14.6863 5.58172 12 10 12C14.4183 12 18 14.6863 18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </nav>
                            <div class="app-rightbar">
                                <div class="rightbar-header">
                                    <span>Online</span>
                                </div>
                                <div class="rightbar-users" id="rightbar-users">
                                    <div class="loading-spinner" style="padding:20px 0;">Loading...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                document.querySelectorAll('.sidebar-nav-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const route = item.dataset.route;
                        if (route) this.navigate(route);
                    });
                });

                const profile = document.getElementById('sidebar-profile');
                if (profile) {
                    profile.addEventListener('click', () => this.navigate('profile'));
                }

                if (cleanPath === 'feed' && queryString) {
                    const qs = new URLSearchParams(queryString);
                    const catFromQs = qs.get('category');
                    if (catFromQs) {
                        document.querySelectorAll('.sidebar-cat-pill').forEach(p => {
                            p.classList.toggle('active', p.dataset.category === catFromQs);
                        });
                    }
                }

                document.querySelectorAll('.sidebar-cat-pill').forEach(pill => {
                    pill.addEventListener('click', () => {
                        const cat = pill.dataset.category;
                        this.navigate(`feed?category=${cat}`);
                    });
                });

                const fab = document.getElementById('fab-create');
                if (fab) {
                    fab.addEventListener('click', () => this.navigate('create'));
                }

                document.querySelectorAll('#bottom-nav .nav-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const route = item.dataset.route;
                        if (route) this.navigate(route);
                    });
                });

                const allBottomNavItems = document.querySelectorAll('#bottom-nav .nav-item');
                allBottomNavItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.route === cleanPath);
                });

                this.loadRightbarUsers();

                const panel = document.getElementById('app-panel');
                await this.routes[pattern](panel, match.params, queryString);

                const bottomNav = document.getElementById('bottom-nav');
                if (bottomNav) {
                    const isChatConversation = /^chat\/\d+$/.test(cleanPath);
                    bottomNav.style.display = isChatConversation ? 'none' : '';
                }

                this.ensureGlobalUsersScroll();
                this.loadGlobalUsersScroll();
                return;
            }
        }

        const app = document.getElementById('app');
        const isAuth = window.__isAuthenticated === true;
        app.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px;text-align:center;">
                <div style="font-size:72px;font-weight:600;color:rgba(255,255,255,0.08);letter-spacing:-3px;line-height:1;margin-bottom:8px;">404</div>
                <h1 style="font-size:20px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;font-family:Inter,sans-serif;">Page not found</h1>
                <p style="font-size:14px;color:var(--text-muted);margin-bottom:24px;font-family:Inter,sans-serif;">The page you're looking for doesn't exist.</p>
                <button id="go-home-btn" style="padding:12px 24px;background:linear-gradient(135deg,rgba(32,178,166,0.2),rgba(32,178,166,0.08));border:1px solid rgba(32,178,166,0.18);border-radius:14px;color:rgba(255,255,255,0.9);font-size:14px;font-family:Inter,sans-serif;font-weight:500;cursor:pointer;transition:all 0.3s ease;">${isAuth ? 'Go to Feed' : 'Go to Login'}</button>
            </div>
        `;
        document.getElementById('go-home-btn').addEventListener('click', () => {
            this.navigate(isAuth ? 'feed' : 'login');
        });
    }

    loadRightbarUsers() {
        renderAllUserLists();
    }

    ensureGlobalUsersScroll() {
        const panel = document.getElementById('app-panel');
        if (!panel) return;
        let wrapper = document.getElementById('global-users-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'users-wrapper';
            wrapper.id = 'global-users-wrapper';
            wrapper.innerHTML = '<div class="users-scroll" id="global-users-scroll"><div class="loading-spinner">Loading users...</div></div>';
            panel.insertBefore(wrapper, panel.firstChild);
        }
    }

    loadGlobalUsersScroll() {
        renderAllUserLists();
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
    }

    matchRoute(pattern, path) {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) {
            return null;
        }

        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params[patternParts[i].slice(1)] = pathParts[i];
            } else if (patternParts[i] !== pathParts[i]) {
                return null;
            }
        }

        return { params };
    }

    start() {
        this.resolve();
    }
}

export const router = new Router();