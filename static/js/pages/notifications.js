import { api } from '../api.js';
import { router } from '../router.js';
import { escapeHtml, timeAgo } from '../utils.js';
import { ws } from '../websocket.js';

let offset = 0;
const LIMIT = 15;
let hasMore = true;
let isLoading = false;
let notificationsCache = [];
let unreadCount = 0;

export async function renderNotifications(app, params, queryString) {
    offset = 0;
    hasMore = true;
    isLoading = false;
    notificationsCache = [];

    app.innerHTML = `
        <div class="notifications-page">
            <div class="notifications-header">
                <div class="notifications-header-left">
                    <h2 class="notifications-title">Notifications</h2>
                    <span class="notifications-badge" id="notifications-badge" style="display:none;"></span>
                </div>
                <button class="notifications-mark-all-btn" id="mark-all-read-btn" style="display:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Mark all as read
                </button>
            </div>
            <div class="notifications-list" id="notifications-list">
                <div class="loading-spinner">Loading notifications...</div>
            </div>
        </div>
    `;

    await loadUnreadCount();
    await loadNotifications(true);

    
    const listEl = document.getElementById('notifications-list');
    listEl.addEventListener('scroll', () => {
        if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 150) {
            loadNotifications(false);
        }
    });

    
    document.getElementById('mark-all-read-btn')?.addEventListener('click', markAllAsRead);

    
    if (!window._notifCleanup) {
        window._notifCleanup = ws.on('notification', handleRealtimeNotification);
    }
}

async function loadUnreadCount() {
    
    if (typeof window.__unreadNotifCount === 'number') {
        unreadCount = window.__unreadNotifCount;
        updateUnreadUI();
        return;
    }

    try {
        const res = await api.getUnreadCount();
        unreadCount = res.data?.count || 0;
        window.__unreadNotifCount = unreadCount;
        updateUnreadUI();
    } catch (err) {
        console.error('Failed to load unread count:', err);
    }
}

function updateUnreadUI() {
    const badge = document.getElementById('notifications-badge');
    const markAllBtn = document.getElementById('mark-all-read-btn');
    
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    if (markAllBtn) {
        markAllBtn.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    }

    
    syncSidebarBadge();
}

function syncSidebarBadge() {
    window.__unreadNotifCount = unreadCount;

    
    const sidebarNavItem = document.querySelector('.sidebar-nav-item[data-route="notifications"]');
    if (sidebarNavItem) {
        let badgeEl = sidebarNavItem.querySelector('.nav-badge');
        if (unreadCount > 0) {
            if (!badgeEl) {
                badgeEl = document.createElement('span');
                badgeEl.className = 'nav-badge';
                sidebarNavItem.appendChild(badgeEl);
            }
            badgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badgeEl.style.display = '';
        } else if (badgeEl) {
            badgeEl.style.display = 'none';
        }
    }

    
    const bottomNavItem = document.querySelector('#bottom-nav .nav-item[data-route="notifications"]');
    if (bottomNavItem) {
        let bottomBadge = bottomNavItem.querySelector('.nav-badge');
        if (unreadCount > 0) {
            if (!bottomBadge) {
                bottomBadge = document.createElement('span');
                bottomBadge.className = 'nav-badge';
                bottomNavItem.appendChild(bottomBadge);
            }
            bottomBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            bottomBadge.style.display = '';
        } else if (bottomBadge) {
            bottomBadge.style.display = 'none';
        }
    }
}

async function loadNotifications(reset = false) {
    if (isLoading || (!hasMore && !reset)) return;
    isLoading = true;

    const listEl = document.getElementById('notifications-list');
    if (reset) {
        listEl.innerHTML = '<div class="loading-spinner">Loading notifications...</div>';
        offset = 0;
        hasMore = true;
    }

    try {
        const res = await api.getNotifications(offset, LIMIT);
        const data = res.data || {};
        const notifications = data.notifications || [];

        if (reset) {
            listEl.innerHTML = '';
            notificationsCache = [];
        }

        if (notifications.length === 0 && reset) {
            listEl.innerHTML = renderEmptyState();
            hasMore = false;
            return;
        }

        notificationsCache = [...notificationsCache, ...notifications];
        offset += notifications.length;
        hasMore = notifications.length >= LIMIT;

        renderNotificationList(listEl);
    } catch (err) {
        if (reset) {
            listEl.innerHTML = '<div class="empty-state">Failed to load notifications. Try again later.</div>';
        }
        console.error('Failed to load notifications:', err);
    } finally {
        isLoading = false;
        const spinner = listEl.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
    }
}

function renderNotificationList(listEl) {
    if (notificationsCache.length === 0) {
        listEl.innerHTML = renderEmptyState();
        return;
    }

    listEl.innerHTML = notificationsCache.map(notif => renderNotificationCard(notif)).join('');

    
    listEl.querySelectorAll('.notif-card').forEach(card => {
        card.addEventListener('click', (e) => {
            
            if (e.target.closest('.notif-mark-read-btn')) return;
            
            const notifId = parseInt(card.dataset.notifId, 10);
            const entityType = card.dataset.entityType;
            const entityId = card.dataset.entityId;
            const actorId = card.dataset.actorId;
            handleNotificationClick(notifId, entityType, entityId, actorId, card);
        });
    });

    
    listEl.querySelectorAll('.notif-mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const notifId = parseInt(btn.dataset.notifId, 10);
            const card = btn.closest('.notif-card');
            await markSingleAsRead(notifId, card);
        });
    });
}

function renderNotificationCard(notif) {
    const isUnread = notif.isRead === 0;
    const actorInitials = notif.actorNickname ? notif.actorNickname.substring(0, 2).toUpperCase() : '?';
    const entityLabel = notif.entityType === 'comment' ? 'commented on a post' : 'sent you a message';
    const timeText = timeAgo(notif.createdAt);

    return `
        <div class="notif-card ${isUnread ? 'notif-card--unread' : ''}" 
             data-notif-id="${notif.notificationId}" 
             data-entity-type="${notif.entityType}" 
             data-entity-id="${notif.entityId}"
             data-actor-id="${notif.actorId}">
            <div class="notif-card-left">
                <div class="notif-avatar">${actorInitials}</div>
                ${isUnread ? '<div class="notif-unread-dot"></div>' : ''}
            </div>
            <div class="notif-card-body">
                <div class="notif-card-text">
                    <span class="notif-actor-name">${escapeHtml(notif.actorNickname)}</span>
                    <span class="notif-action">${entityLabel}</span>
                </div>
                <span class="notif-time">${timeText}</span>
            </div>
            ${isUnread ? `
                <button class="notif-mark-read-btn" data-notif-id="${notif.notificationId}" aria-label="Mark as read" title="Mark as read">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </button>
            ` : ''}
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="notif-empty-state">
            <div class="notif-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            <h3>No notifications yet</h3>
            <p>When someone comments on your post or sends you a message, you'll see it here.</p>
        </div>
    `;
}

async function handleNotificationClick(notifId, entityType, entityId, actorId, card) {
    
    markSingleAsRead(notifId, card);

    
    if (entityType === 'comment') {
        router.navigate(`post/${entityId}`);
    } else if (entityType === 'message') {
        router.navigate(`chat/${actorId}`);
    }
}

async function markSingleAsRead(notifId, card) {
    try {
        await api.markAsRead(notifId);
        
        if (card) {
            card.classList.remove('notif-card--unread');
            const dot = card.querySelector('.notif-unread-dot');
            if (dot) dot.remove();
            const btn = card.querySelector('.notif-mark-read-btn');
            if (btn) btn.remove();
        }

        
        const cached = notificationsCache.find(n => n.notificationId === notifId);
        if (cached) cached.isRead = 1;

        
        if (unreadCount > 0) {
            unreadCount--;
            updateUnreadUI();
        }
    } catch (err) {
        console.error('Failed to mark notification as read:', err);
    }
}

async function markAllAsRead() {
    const btn = document.getElementById('mark-all-read-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Marking...';
    }

    try {
        await api.markAllAsRead();
        
        
        notificationsCache.forEach(n => n.isRead = 1);
        unreadCount = 0;
        updateUnreadUI();

        
        const listEl = document.getElementById('notifications-list');
        if (listEl) {
            renderNotificationList(listEl);
        }
    } catch (err) {
        console.error('Failed to mark all as read:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Mark all as read
            `;
        }
    }
}

function handleRealtimeNotification(payload) {
    if (!payload) return;

    
    unreadCount++;
    updateUnreadUI();

    
    const listEl = document.getElementById('notifications-list');
    if (listEl) {
        
        const page = document.querySelector('.notifications-page');
        if (page) {
            const newNotif = {
                notificationId: payload.notificationId,
                actorId: payload.actorId,
                actorNickname: payload.actorNickname,
                entityType: payload.entityType,
                entityId: payload.entityId,
                isRead: 0,
                createdAt: payload.createdAt || new Date().toISOString(),
            };

            notificationsCache.unshift(newNotif);

            
            const emptyState = listEl.querySelector('.notif-empty-state');
            if (emptyState) {
                listEl.innerHTML = '';
            }

            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderNotificationCard(newNotif);
            const newCard = tempDiv.firstElementChild;
            listEl.insertBefore(newCard, listEl.firstChild);

            
            newCard.addEventListener('click', (e) => {
                if (e.target.closest('.notif-mark-read-btn')) return;
                handleNotificationClick(newNotif.notificationId, newNotif.entityType, newNotif.entityId, newNotif.actorId, newCard);
            });

            const markReadBtn = newCard.querySelector('.notif-mark-read-btn');
            if (markReadBtn) {
                markReadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    markSingleAsRead(newNotif.notificationId, newCard);
                });
            }
        }
    }

    
    showToast(payload);
}

function showToast(payload) {
    
    const existingToast = document.querySelector('.notif-toast');
    if (existingToast) existingToast.remove();

    const entityLabel = payload.entityType === 'comment' ? 'commented on your post' : 'sent you a message';
    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.innerHTML = `
        <div class="notif-toast-content">
            <div class="notif-toast-avatar">${payload.actorNickname ? payload.actorNickname.substring(0, 2).toUpperCase() : '?'}</div>
            <div class="notif-toast-text">
                <span class="notif-toast-name">${escapeHtml(payload.actorNickname)}</span>
                <span class="notif-toast-action">${entityLabel}</span>
            </div>
        </div>
    `;

    toast.addEventListener('click', () => {
        if (payload.entityType === 'comment') {
            router.navigate(`post/${payload.entityId}`);
        } else if (payload.entityType === 'message') {
            router.navigate(`chat/${payload.actorId}`);
        }
        toast.remove();
    });

    document.body.appendChild(toast);

    
    requestAnimationFrame(() => {
        toast.classList.add('notif-toast--visible');
    });

    
    setTimeout(() => {
        toast.classList.remove('notif-toast--visible');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}