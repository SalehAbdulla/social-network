import { api } from '../api.js';
import { ws } from '../websocket.js';
import { escapeHtml } from '../utils.js';

let users = [];
let initialized = false;

function navigateTo(path) {
    history.pushState(null, '', '/' + path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

export function initUsersManager() {
    if (initialized) return;
    initialized = true;
    console.log('[UsersManager] Init');

    refreshUsers();

    ws.on('user_status', (payload) => {
        console.log('[UsersManager] user_status:', payload);
        if (!payload || !payload.userId) return;
        handleUserStatusUpdate(payload.userId, payload.isOnline === 1);
    });

    ws.on('incoming_msg', (payload) => {
        if (!payload || !payload.senderId) return;
        handleIncomingMessageUpdate(payload.senderId, payload.timeStamp || new Date().toISOString());
    });

    ws.on('connected', () => {
        console.log('[UsersManager] WS reconnect, refreshing');
        refreshUsers();
    });
}

export async function refreshUsers() {
    try {
        const res = await api.getChatUsers();
        users = res.data || [];
        console.log('[UsersManager] API returned', users.length, 'users');
    } catch (err) {
        console.error('[UsersManager] API failed:', err);
        if (users.length === 0) users = [];
    }
    sortUsers();
    renderAllUserLists();
}

export function getUsers() {
    return users;
}

function sortUsers() {
    users.sort((a, b) => {
        const aTime = a.lastMessageTime || '';
        const bTime = b.lastMessageTime || '';
        if (aTime && bTime) return bTime.localeCompare(aTime);
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;
        return (a.nickname || '').localeCompare(b.nickname || '');
    });
}

function handleUserStatusUpdate(userId, isOnline) {
    const user = users.find(u => u.userId === userId);
    if (user) {
        user.isOnline = isOnline ? 1 : 0;
    } else {
        users.push({
            userId: userId,
            nickname: userId,
            isOnline: isOnline ? 1 : 0,
            lastMessageTime: null,
        });
    }
    sortUsers();
    renderAllUserLists();
}

function handleIncomingMessageUpdate(senderId, timeStamp) {
    const user = users.find(u => u.userId === senderId);
    if (user) {
        user.lastMessageTime = timeStamp;
    } else {
        refreshUsers();
        return;
    }
    sortUsers();
    renderAllUserLists();
}

export function renderAllUserLists() {
    renderUserCards('global-users-scroll', 'user-card');
    renderRightbarUsers('rightbar-users');
    renderUserCards('users-scroll', 'user-card');
}

function renderUserCards(containerId, cardClass) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="${cardClass}" data-user-id="${user.userId}">
            <div class="user-avatar-wrapper">
                <div class="user-avatar-sm">${(user.nickname || '?').substring(0, 2).toUpperCase()}</div>
                <div class="online-dot ${user.isOnline === 1 ? 'online' : 'offline'}"></div>
            </div>
            <div class="user-nickname">${escapeHtml(user.nickname || 'User')}</div>
        </div>
    `).join('');

    container.querySelectorAll(`.${cardClass}`).forEach(el => {
        el.addEventListener('click', () => {
            navigateTo(`chat/${el.dataset.userId}`);
        });
    });
}

function renderRightbarUsers(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="rightbar-empty">No users online</div>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="rightbar-user" data-user-id="${user.userId}">
            <div class="rightbar-user-avatar">${(user.nickname || '?').substring(0, 2).toUpperCase()}</div>
            <div class="rightbar-user-info">
                <span class="rightbar-user-name">${escapeHtml(user.nickname || 'User')}</span>
                <span class="rightbar-user-status ${user.isOnline === 1 ? 'online' : 'offline'}">
                    ${user.isOnline === 1 ? 'Online' : 'Offline'}
                </span>
            </div>
            <div class="rightbar-status-dot ${user.isOnline === 1 ? 'online' : 'offline'}"></div>
        </div>
    `).join('');

    container.querySelectorAll('.rightbar-user').forEach(el => {
        el.addEventListener('click', () => {
            navigateTo(`chat/${el.dataset.userId}`);
        });
    });
}
