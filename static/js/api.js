const API_BASE = '';

async function apiRequest(method, path, body) {
    const options = {
        method,
        credentials: 'include',
        headers: {},
    };

    if (body instanceof FormData) {
        options.body = body;
    } else if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();

    if (!res.ok) {
        throw { status: res.status, ...data };
    }

    return data;
}

function formEncode(obj) {
    const formData = new FormData();
    for (const key in obj) {
        formData.append(key, obj[key]);
    }
    return formData;
}

export const api = {
    
    login: (identifier, password, rememberMe = false) =>
        apiRequest('POST', '/api/v1/auth/login', formEncode({ identifier, password, rememberMe })),

    register: (fields) =>
        apiRequest('POST', '/api/v1/auth/register', formEncode(fields)),

    logout: () =>
        apiRequest('POST', '/api/v1/auth/logout'),

    me: () =>
        apiRequest('GET', '/api/v1/auth/me'),

    
    getPosts: (page = 1, size = 10, sortBy = 'createdAt', sortOrder = 'desc', categoryId = 0) => {
        let url = `/api/v1/posts?page=${page}&size=${size}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
        if (categoryId > 0) url += `&categoryId=${categoryId}`;
        return apiRequest('GET', url);
    },

    getPost: (postId) =>
        apiRequest('GET', `/api/v1/post?id=${postId}`),

    createPost: (title, content, categoryId) =>
        apiRequest('POST', '/api/v1/posts', { title, content, categoryId }),

    
    getComments: (postId, page = 1, size = 10, sortBy = 'createdAt', sortOrder = 'desc') =>
        apiRequest('GET', `/api/v1/posts/comments?postId=${postId}&page=${page}&size=${size}&sortBy=${sortBy}&sortOrder=${sortOrder}`),

    createComment: (postId, content) =>
        apiRequest('POST', '/api/v1/posts/comments', formEncode({ postId, content })),

    
    react: (entityType, entityId, score) =>
        apiRequest('POST', '/api/v1/reactions', { entityType, entityId, score }),

    
    getCategories: () =>
        apiRequest('GET', '/api/v1/categories'),

    
    getChatUsers: () =>
        apiRequest('GET', '/api/v1/messages/users'),

    getMessages: (partnerId, offset = 0) =>
        apiRequest('GET', `/api/v1/messages?partnerId=${partnerId}&offset=${offset}`),

    deletePost: (postId) =>
        apiRequest('DELETE', `/api/v1/posts?id=${postId}`),

    deleteComment: (commentId) =>
        apiRequest('DELETE', `/api/v1/posts/comments?id=${commentId}`),

    
    getNotifications: (offset = 0, limit = 10, unread = false) =>
        apiRequest('GET', `/api/v1/notifications?offset=${offset}&limit=${limit}${unread ? '&unread=true' : ''}`),

    getUnreadCount: () =>
        apiRequest('GET', '/api/v1/notifications/unread-count'),

    markAsRead: (notificationId) =>
        apiRequest('PATCH', `/api/v1/notifications/${notificationId}/read`),

    markAllAsRead: () =>
        apiRequest('PATCH', '/api/v1/notifications/read-all'),
};