import { api } from '../api.js';
import { router } from '../router.js';
import { ws } from '../websocket.js';
import { escapeHtml, showInputError, throttle } from '../utils.js';

let currentChatUserId = null;
let currentChatUser = null;
let messages = [];
let offset = 0;
const LIMIT = 10;
let hasMore = true;
let isLoading = false;
let isLoadingOlder = false;
let chatUsers = [];
let activeUserId = null;
let typingTimer = null;
const TYPING_DEBOUNCE_MS = 2000;
const TYPING_THROTTLE_MS = 1500;
let lastTypingEmit = 0;
let typingIndicatorHideTimer = null;
let unreadCounts = {};
let messageIds = new Set();

export async function renderChat(app, params, queryString) {
    activeUserId = window.__user?.userId || window.__user?.id;
    if (!activeUserId) {
        app.innerHTML = '<div class="empty-state">Please log in to use chat.</div>';
        return;
    }

    app.innerHTML = `
        <div class="chat-layout">
            <div class="chat-sidebar" id="chat-sidebar">
                <div class="chat-sidebar-header">
                    <div class="chat-search-wrapper">
                        <svg class="chat-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <input type="text" class="chat-search-input" id="chat-search-input" placeholder="Search conversations..." />
                    </div>
                </div>
                <div class="chat-conversations" id="chat-conversations">
                    <div class="loading-spinner">Loading conversations...</div>
                </div>
            </div>

            <div class="chat-main" id="chat-main">
                <div class="chat-welcome" id="chat-welcome">
                    <div class="chat-welcome-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            <path d="M8 10h.01M12 10h.01M16 10h.01"/>
                        </svg>
                    </div>
                    <h3 class="chat-welcome-title">Your Messages</h3>
                    <p class="chat-welcome-subtitle">Select a conversation from the left to start chatting</p>
                </div>

                <div class="chat-conversation" id="chat-conversation" style="display:none;">
                    <div class="chat-conversation-header" id="chat-conversation-header">
                        <button class="chat-back-btn" id="chat-back-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                        </button>
                        <div class="chat-partner-avatar" id="chat-partner-avatar">?</div>
                        <div class="chat-partner-info">
                            <span class="chat-partner-name" id="chat-partner-name">User</span>
                            <span class="chat-partner-status" id="chat-partner-status">offline</span>
                        </div>
                    </div>

                    <div class="chat-messages" id="chat-messages">
                        <div class="chat-messages-loader" id="chat-messages-loader" style="display:none;">
                            <div class="loading-spinner">Loading older messages...</div>
                        </div>
                        <div class="chat-messages-inner" id="chat-messages-inner"></div>
                        <div class="chat-typing-indicator" id="chat-typing-indicator" style="display:none;">
                            <div class="typing-dots">
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                            </div>
                            <span class="typing-label" id="chat-typing-label"></span>
                        </div>
                    </div>

                    <div class="chat-input-bar" id="chat-input-bar">
                        <div class="chat-input-wrapper">
                            <textarea class="chat-input" id="chat-input" rows="1" placeholder="Type a message..." maxlength="2000"></textarea>
                            <button class="chat-send-btn" id="chat-send-btn" disabled>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (!ws.isConnected) {
        ws.connect();
    }

    loadChatUsers();

    document.getElementById('chat-search-input')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        filterConversations(query);
    });

    document.getElementById('chat-back-btn')?.addEventListener('click', () => {
        closeConversation();
    });

    document.getElementById('chat-send-btn')?.addEventListener('click', sendMessage);

    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('chat-input')?.addEventListener('input', () => {
        const textarea = document.getElementById('chat-input');
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
        updateSendButton();
        emitTyping();
    });

    document.getElementById('chat-input')?.addEventListener('focusout', () => {
        sendTypingStoppedNow();
    });

    window.__pageTeardown = () => {
        sendTypingStoppedNow();
        if (currentChatUserId) {
            ws.send('close_chat', { partnerId: currentChatUserId });
        }
        clearLocalTypingState();
    };

    setupWSListeners();

    if (params && params.userId) {
        currentChatUserId = params.userId;
    }

    
    setupScrollLoading();
}

function setupScrollLoading() {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    
    if (window._scrollThrottled) {
        window._scrollThrottled.cancel();
        messagesEl.removeEventListener('scroll', window._scrollThrottled);
    }

    window._scrollThrottled = throttle(async () => {
        if (!currentChatUserId) return;
        if (isLoading || isLoadingOlder) return;
        if (!hasMore) return;

        const el = document.getElementById('chat-messages');
        if (!el) return;

        
        if (el.scrollTop <= 80) {
            isLoadingOlder = true;
            const previousScrollTop = el.scrollTop;
            const previousScrollHeight = el.scrollHeight;

            await loadMessages(true);

            if (hasMore) {
                const newScrollHeight = el.scrollHeight;
                el.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
            }

            isLoadingOlder = false;
        }
    }, 300);

    messagesEl.addEventListener('scroll', window._scrollThrottled);
}

function setupWSListeners() {
    if (window._wsCleanups) {
        window._wsCleanups.forEach(fn => fn());
    }

    window._wsCleanups = [];

    const cleanup1 = ws.on('incoming_msg', (payload) => {
        handleIncomingMessage(payload);
    });
    window._wsCleanups.push(cleanup1);

    const cleanup2 = ws.on('user_status', (payload) => {
        handleUserStatus(payload);
    });
    window._wsCleanups.push(cleanup2);

    const cleanup3 = ws.on('connected', () => {
        console.log('[Chat] WS connected');
        if (currentChatUserId) {
            ws.send('open_chat', { partnerId: currentChatUserId });
        }
        loadChatUsers();
    });
    window._wsCleanups.push(cleanup3);

    const cleanup4 = ws.on('send_error', (payload) => {
        handleSendError(payload);
    });
    window._wsCleanups.push(cleanup4);

    const cleanup5 = ws.on('typing', (payload) => {
        handleTypingIndicator(payload);
    });
    window._wsCleanups.push(cleanup5);

    const cleanup6 = ws.on('typing_stopped', (payload) => {
        handleTypingStoppedIndicator(payload);
    });
    window._wsCleanups.push(cleanup6);
}

async function loadChatUsers() {
    const container = document.getElementById('chat-conversations');
    if (!container) return;

    try {
        const res = await api.getChatUsers();
        chatUsers = res.data || [];
        renderConversations(chatUsers);
    } catch (err) {
        container.innerHTML = '<div class="chat-conv-error">Failed to load conversations.</div>';
    }
}

function renderConversations(users) {
    const container = document.getElementById('chat-conversations');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="chat-conv-empty"><div class="chat-conv-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>No conversations yet</p><span>Start chatting with online users</span></div>';
        return;
    }

    const renderItem = (user) => {
        const isOnline = user.isOnline === 1;
        const initials = user.nickname ? user.nickname.substring(0, 2).toUpperCase() : '?';
        const unread = unreadCounts[user.userId] || 0;
        const isActive = currentChatUserId === user.userId;

        return `
            <div class="chat-conv-item ${isActive ? 'active' : ''}" data-user-id="${user.userId}" data-online="${isOnline}">
                <div class="chat-conv-avatar-wrapper">
                    <div class="chat-conv-avatar">${initials}</div>
                    <div class="chat-conv-status ${isOnline ? 'online' : 'offline'}"></div>
                </div>
                <div class="chat-conv-info">
                    <div class="chat-conv-top">
                        <span class="chat-conv-name">${escapeHtml(user.nickname || 'User')}</span>
                        ${unread > 0 ? `<span class="chat-conv-badge">${unread}</span>` : ''}
                    </div>
                    <span class="chat-conv-preview">${isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </div>
        `;
    };

    const onlineUsers = users.filter(u => u.isOnline === 1);
    const offlineUsers = users.filter(u => u.isOnline === 0 || u.isOnline === undefined || u.isOnline === null);

    let html = '';
    if (onlineUsers.length > 0) {
        html += `<div class="chat-conv-section-header">Online | ${onlineUsers.length}</div>`;
        html += onlineUsers.map(renderItem).join('');
    }
    if (offlineUsers.length > 0) {
        html += `<div class="chat-conv-section-header">Offline | ${offlineUsers.length}</div>`;
        html += offlineUsers.map(renderItem).join('');
    }

    container.innerHTML = html;

    container.querySelectorAll('.chat-conv-item').forEach(el => {
        el.addEventListener('click', () => {
            const userId = el.dataset.userId;
            openConversation(userId);
        });
    });

    if (currentChatUserId) {
        openConversation(currentChatUserId);
    }
}

function filterConversations(query) {
    const items = document.querySelectorAll('.chat-conv-item');
    items.forEach(item => {
        const name = item.querySelector('.chat-conv-name')?.textContent?.toLowerCase() || '';
        item.style.display = (!query || name.includes(query)) ? 'flex' : 'none';
    });
}

async function openConversation(userId) {
    if (!userId) return;

    
    const prevPartner = currentChatUserId;
    if (prevPartner) {
        ws.send('close_chat', { partnerId: prevPartner });
        if (prevPartner !== userId) {
            sendTypingStoppedNow(prevPartner);
        }
    }

    hideTypingIndicator();
    if (typingIndicatorHideTimer) {
        clearTimeout(typingIndicatorHideTimer);
        typingIndicatorHideTimer = null;
    }
    setPartnerStatusTyping(false);

    delete unreadCounts[userId];

    currentChatUserId = userId;
    offset = 0;
    messages = [];
    messageIds.clear();
    hasMore = true;

    document.querySelectorAll('.chat-conv-item').forEach(el => {
        el.classList.toggle('active', el.dataset.userId === userId);
    });

    document.getElementById('chat-welcome').style.display = 'none';
    const conversationEl = document.getElementById('chat-conversation');
    conversationEl.style.display = 'flex';

    const user = chatUsers.find(u => u.userId === userId);
    currentChatUser = user;

    const isOnline = user?.isOnline === 1;
    const initials = user?.nickname ? user.nickname.substring(0, 2).toUpperCase() : '?';
    document.getElementById('chat-partner-avatar').textContent = initials;
    document.getElementById('chat-partner-name').textContent = escapeHtml(user?.nickname || 'User');

    const statusEl = document.getElementById('chat-partner-status');
    statusEl.textContent = isOnline ? 'Online' : 'Offline';
    statusEl.className = 'chat-partner-status ' + (isOnline ? 'online' : 'offline');

    if (window.innerWidth <= 768) {
        document.getElementById('chat-sidebar').classList.add('hidden');
    }

    
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';

    await loadMessages(false);
    jumpToBottom();
    updateInputForOnlineStatus(isOnline);

    
    
    ws.send('open_chat', { partnerId: userId });

    const input = document.getElementById('chat-input');
    if (input) input.focus();
}

function closeConversation() {
    
    if (currentChatUserId) {
        sendTypingStoppedNow();
        ws.send('close_chat', { partnerId: currentChatUserId });
    }

    clearLocalTypingState();

    currentChatUserId = null;
    currentChatUser = null;
    document.getElementById('chat-welcome').style.display = 'flex';
    document.getElementById('chat-conversation').style.display = 'none';

    if (window.innerWidth <= 768) {
        document.getElementById('chat-sidebar').classList.remove('hidden');
    }

    
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.style.display = '';
}

async function loadMessages(isOlder = false) {
    if (!currentChatUserId || isLoading || !hasMore) return;

    isLoading = true;
    const loader = document.getElementById('chat-messages-loader');
    if (offset > 0) {
        loader.style.display = 'block';
    }

    try {
        const res = await api.getMessages(currentChatUserId, offset);
        const data = res.data || {};
        const newMessages = data.messages || [];

        const totalElements = data.totalElements || 0;
        const loadedSoFar = offset + newMessages.length;
        if (loadedSoFar >= totalElements) {
            hasMore = false;
        }

        const uniqueMessages = newMessages.filter(msg => !messageIds.has(msg.messageId));
        uniqueMessages.forEach(msg => messageIds.add(msg.messageId));

        if (uniqueMessages.length === 0) {
            return;
        }

        const ordered = [...uniqueMessages].reverse();

        if (isOlder) {
            messages = [...ordered, ...messages];
        } else {
            messages = ordered;
        }

        offset += uniqueMessages.length;
        renderMessages();
    } catch (err) {
        console.error('Failed to load messages:', err);
    } finally {
        isLoading = false;
        loader.style.display = 'none';

        
        fillViewportIfNeeded();
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages-inner');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="chat-empty-msgs">
                <div class="chat-empty-msgs-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <p>No messages yet</p>
                <span>Say hello to start a conversation!</span>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = null;
    let lastSenderId = null;

    messages.forEach((msg) => {
        const msgDate = formatDate(msg.timeStamp || msg.createdAt);
        const isNewDay = msgDate !== lastDate;
        const isSameSender = msg.senderId === lastSenderId;
        const isMine = msg.senderId === activeUserId;

        if (isNewDay) {
            html += `<div class="chat-date-separator"><span>${msgDate}</span></div>`;
        }

        const showAvatar = !isSameSender || isNewDay;

        html += `
            <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-theirs'} ${!showAvatar ? 'chat-msg-continued' : ''}">
                <div class="chat-msg-content">
                    <div class="chat-msg-bubble">
                        <p>${escapeHtml(msg.textMessage || msg.text || '')}</p>
                    </div>
                    <div class="chat-msg-meta">
                        <span class="chat-msg-time">${formatTime(msg.timeStamp || msg.createdAt)}</span>
                        ${isMine ? `<span class="chat-msg-status"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>` : ''}
                    </div>
                </div>
            </div>
        `;

        lastDate = msgDate;
        lastSenderId = msg.senderId;
    });

    container.innerHTML = html;
    updateConversationPreviews();

    
    fillViewportIfNeeded();
}

function fillViewportIfNeeded() {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl || !hasMore || isLoading || isLoadingOlder || !currentChatUserId) return;

    
    requestAnimationFrame(() => {
        if (messagesEl.scrollHeight <= messagesEl.clientHeight + 10 && hasMore) {
            loadMessages(true);
        }
    });
}

function handleIncomingMessage(payload) {
    if (!payload) return;

    const msg = {
        messageId: payload.messageId || Date.now(),
        senderId: payload.senderId,
        textMessage: payload.text,
        text: payload.text,
        timeStamp: payload.timeStamp,
        createdAt: payload.timeStamp,
        senderNickname: payload.senderNickname,
    };

    if (currentChatUserId === payload.senderId) {
        hideTypingIndicator();
        if (typingIndicatorHideTimer) {
            clearTimeout(typingIndicatorHideTimer);
            typingIndicatorHideTimer = null;
        }
        setPartnerStatusTyping(false);
        updateSidebarTypingPreview(payload.senderId, false);

        if (messageIds.has(msg.messageId)) return;
        messageIds.add(msg.messageId);

        messages.push(msg);
        renderMessages();
        jumpToBottom();

        delete unreadCounts[payload.senderId];
    } else {
        unreadCounts[payload.senderId] = (unreadCounts[payload.senderId] || 0) + 1;
        updateConversationPreviews();
    }

    
    const sender = chatUsers.find(u => u.userId === payload.senderId);
    if (sender) {
        sender.lastMessageTime = payload.timeStamp || new Date().toISOString();
    } else {
        loadChatUsers();
        return;
    }

    
    chatUsers.sort((a, b) => {
        const aTime = a.lastMessageTime || '';
        const bTime = b.lastMessageTime || '';

        
        if (aTime && bTime) {
            return bTime.localeCompare(aTime);
        }
        
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;

        
        return (a.nickname || '').localeCompare(b.nickname || '');
    });

    renderConversations(chatUsers);
}

function handleUserStatus(payload) {
    if (!payload) return;

    const userId = payload.userId;
    const isOnline = payload.isOnline === 1;

    const user = chatUsers.find(u => u.userId === userId);
    if (user) {
        user.isOnline = isOnline ? 1 : 0;
    }
    if (currentChatUser && currentChatUser.userId === userId) {
        currentChatUser.isOnline = isOnline ? 1 : 0;
    }

    
    renderConversations(chatUsers);

    if (currentChatUserId === userId) {
        const statusEl = document.getElementById('chat-partner-status');
        if (statusEl) {
            statusEl.textContent = isOnline ? 'Online' : 'Offline';
            statusEl.className = 'chat-partner-status ' + (isOnline ? 'online' : 'offline');
        }
        updateInputForOnlineStatus(isOnline);
    }
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentChatUserId) return;

    
    if (text.length > 2000) {
        showChatError('Message is too long. Please keep it under 2000 characters.');
        return;
    }
    if (text.length < 1) {
        showChatError('Please type a message.');
        return;
    }

    const offline = currentChatUser && currentChatUser.isOnline === 0;
    if (offline) {
        showChatError('User is offline. Messages can only be sent to online users.');
        return;
    }

    const sent = ws.send('private_msg', {
        recipientId: currentChatUserId,
        text: text,
    });

    if (sent) {
        const optimisticMsg = {
            messageId: Date.now(),
            senderId: activeUserId,
            textMessage: text,
            text: text,
            timeStamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };

        if (!messageIds.has(optimisticMsg.messageId)) {
            messageIds.add(optimisticMsg.messageId);
            messages.push(optimisticMsg);
            renderMessages();
            scrollToBottom(true);
        }

        input.value = '';
        input.style.height = 'auto';
        updateSendButton();
        sendTypingStoppedNow();
    } else {
        console.warn('[Chat] Message not sent (WS not connected). Reconnecting...');
        showChatError('Not connected. Reconnecting...');
        ws.connect();
    }
}

function emitTyping() {
    if (!currentChatUserId || !ws.isConnected) return;

    const now = Date.now();

    
    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    
    if (now - lastTypingEmit >= TYPING_THROTTLE_MS) {
        lastTypingEmit = now;
        ws.send('typing', {
            senderId: activeUserId,
            recipientId: currentChatUserId,
        });
    }

    
    typingTimer = setTimeout(() => {
        sendTypingStoppedNow();
    }, TYPING_DEBOUNCE_MS);
}

function sendTypingStoppedNow(targetUserId) {
    const recipientId = targetUserId || currentChatUserId;

    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }

    const wasTyping = lastTypingEmit > 0;
    lastTypingEmit = 0;

    if (!wasTyping && !targetUserId) return;
    if (!recipientId || !ws.isConnected) return;

    ws.send('typing_stopped', {
        senderId: activeUserId,
        recipientId: recipientId,
    });
}

function handleTypingIndicator(payload) {
    if (!payload) return;

    updateSidebarTypingPreview(payload.senderId, true);

    if (payload.senderId !== currentChatUserId) return;

    showTypingIndicator(payload.senderNickname);
    setPartnerStatusTyping(true);

    if (typingIndicatorHideTimer) {
        clearTimeout(typingIndicatorHideTimer);
    }
    typingIndicatorHideTimer = setTimeout(() => {
        hideTypingIndicator();
        setPartnerStatusTyping(false);
        updateSidebarTypingPreview(payload.senderId, false);
        typingIndicatorHideTimer = null;
    }, TYPING_DEBOUNCE_MS + 500);
}

function handleTypingStoppedIndicator(payload) {
    if (!payload) return;

    updateSidebarTypingPreview(payload.senderId, false);

    if (payload.senderId !== currentChatUserId) return;

    hideTypingIndicator();
    setPartnerStatusTyping(false);

    if (typingIndicatorHideTimer) {
        clearTimeout(typingIndicatorHideTimer);
        typingIndicatorHideTimer = null;
    }
}

function showTypingIndicator(nickname) {
    const indicator = document.getElementById('chat-typing-indicator');
    if (!indicator) return;

    const label = document.getElementById('chat-typing-label');
    const name = nickname || currentChatUser?.nickname || 'User';
    if (label) {
        label.textContent = `${name} is typing`;
    }

    const wasHidden = indicator.style.display === 'none' || indicator.style.display === '';
    indicator.style.display = 'flex';

    const container = document.getElementById('chat-messages');
    if (container && wasHidden) {
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (nearBottom) scrollToBottom(true);
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('chat-typing-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function setPartnerStatusTyping(isTyping, nickname) {
    const statusEl = document.getElementById('chat-partner-status');
    if (!statusEl || !currentChatUserId) return;

    if (isTyping) {
        const name = nickname || currentChatUser?.nickname || 'User';
        statusEl.textContent = `${name} is typing...`;
        statusEl.className = 'chat-partner-status typing';
    } else {
        const isOnline = currentChatUser && currentChatUser.isOnline === 1;
        statusEl.textContent = isOnline ? 'Online' : 'Offline';
        statusEl.className = 'chat-partner-status ' + (isOnline ? 'online' : 'offline');
    }
}

function updateSidebarTypingPreview(userId, isTyping) {
    if (!userId) return;

    const item = document.querySelector(`.chat-conv-item[data-user-id="${userId}"]`);
    if (!item) return;

    const preview = item.querySelector('.chat-conv-preview');
    if (!preview) return;

    if (isTyping) {
        if (!preview.dataset.defaultText) {
            preview.dataset.defaultText = preview.textContent;
        }
        preview.textContent = 'typing...';
        preview.classList.add('chat-conv-preview-typing');
    } else {
        if (preview.dataset.defaultText) {
            preview.textContent = preview.dataset.defaultText;
            delete preview.dataset.defaultText;
        }
        preview.classList.remove('chat-conv-preview-typing');
    }
}

function clearLocalTypingState() {
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
    lastTypingEmit = 0;

    if (typingIndicatorHideTimer) {
        clearTimeout(typingIndicatorHideTimer);
        typingIndicatorHideTimer = null;
    }

    hideTypingIndicator();
}

function updateSendButton() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');
    if (!input || !btn) return;
    btn.disabled = !input.value.trim();
}

function jumpToBottom() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    });
}

function scrollToBottom(animate) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.scrollTo({
        top: container.scrollHeight,
        behavior: animate ? 'smooth' : 'instant',
    });
}

function updateConversationPreviews() {
    const items = document.querySelectorAll('.chat-conv-item');
    items.forEach(item => {
        const userId = item.dataset.userId;
        const unread = unreadCounts[userId] || 0;
        const badge = item.querySelector('.chat-conv-badge');
        if (unread > 0) {
            if (badge) {
                badge.textContent = unread;
            } else {
                const top = item.querySelector('.chat-conv-top');
                if (top) {
                    const b = document.createElement('span');
                    b.className = 'chat-conv-badge';
                    b.textContent = unread;
                    top.appendChild(b);
                }
            }
        } else if (badge) {
            badge.remove();
        }
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function handleSendError(payload) {
    if (!payload) return;
    showChatError(payload.message || 'Message could not be sent. The user is offline.');
}

function showChatError(message) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const existing = container.querySelector('.chat-error-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'chat-error-banner';
    banner.textContent = message;
    container.insertBefore(banner, container.firstChild);

    setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transition = 'opacity 0.3s ease';
        setTimeout(() => banner.remove(), 300);
    }, 4000);
}

function updateInputForOnlineStatus(isOnline) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;

    if (!isOnline) {
        input.disabled = true;
        input.placeholder = 'User is offline, messaging unavailable';
        input.style.opacity = '0.5';
        if (sendBtn) sendBtn.disabled = true;
    } else {
        input.disabled = false;
        input.placeholder = 'Type a message...';
        input.style.opacity = '1';
        if (sendBtn) updateSendButton();
    }
}