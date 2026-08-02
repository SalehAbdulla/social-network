import { api } from '../api.js';
import { escapeHtml, timeAgo, safeUpperCase, showInputError, validateLength } from '../utils.js';
import { router } from '../router.js';
import { renderAllUserLists } from '../components/UsersManager.js';

export async function renderPost(app, params) {
    app.innerHTML = '<div class="loading-spinner">Loading post...</div>';
    
    try {
        const postDTO = await api.getPost(parseInt(params.id));
        
        if (!postDTO.success) {
            app.innerHTML = '<div class="error-state">Failed to load post</div>';
            return;
        }
        
        const post = postDTO.data;
        
        app.innerHTML = `
            <div class="users-wrapper" id="global-users-wrapper">
                <div class="users-scroll" id="global-users-scroll">
                    <div class="loading-spinner">Loading users...</div>
                </div>
            </div>
            <div class="post-detail">
                <div class="post-detail-header">
                    <button class="back-btn" id="back-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <span class="post-detail-title">Post</span>
                </div>
                
                <div class="post-detail-card">
                    <div class="post-detail-user">
                        <div class="post-avatar">${getInitials(post.nickname)}</div>
                        <div class="post-detail-user-info">
                            <span class="post-username">${escapeHtml(safeUpperCase(post.nickname))}</span>
                            <span class="post-time">${timeAgo(post.createdAt)}</span>
                        </div>
                    </div>
                    
                    <h2 class="post-detail-heading">${escapeHtml(post.title)}</h2>
                    <p class="post-detail-body">${escapeHtml(post.content)}</p>
                    
                    <div class="post-detail-actions">
                        <button class="action-btn like-btn" id="detail-like-btn">
                            <svg width="24" height="22" viewBox="0 0 20 18" fill="none">
                                <path d="M10 17C10 17 2 11.5 2 6C2 3.5 4 2 6 2C8 2 10 4 10 4C10 4 12 2 14 2C16 2 18 3.5 18 6C18 11.5 10 17 10 17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span>${post.score || 0}</span>
                        </button>
                        <button class="action-btn comment-btn" id="detail-comment-btn">
                            <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                                <path d="M2 4C2 3.44772 2.44772 3 3 3H17C17.5523 3 18 3.44772 18 4V14C18 14.5523 17.5523 15 17 15H6L3 18V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span>${post.commentsCounter || 0}</span>
                        </button>
                    </div>
                </div>
                
                <div class="comments-section">
                    <div class="comments-header">
                        <h3 class="comments-heading">Comments</h3>
                        <div class="comments-sort">
                            <button class="sort-btn" data-sort="createdAt" data-order="desc">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 5v14M8 9l4-4 4 4M16 15l-4 4-4-4"/>
                                </svg>
                                Newest
                            </button>
                            <button class="sort-btn" data-sort="createdAt" data-order="asc">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 5v14M8 9l4-4 4 4M16 15l-4 4-4-4"/>
                                </svg>
                                Oldest
                            </button>
                            <button class="sort-btn" data-sort="score" data-order="desc">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                                Top
                            </button>
                        </div>
                    </div>
                    <div class="comment-form">
                        <textarea class="comment-input" id="comment-input" placeholder="Write a comment..." rows="3" maxlength="300" data-ascii="true"></textarea>
                        <div class="comment-form-footer">
                            <span class="create-char-count" id="comment-char-count">0/300</span>
                            <button class="comment-submit-btn" id="comment-submit-btn">Post Comment</button>
                        </div>
                    </div>
                    <div class="comments-list" id="comments-list">
                        <div class="loading-spinner">Loading comments...</div>
                    </div>
                    <div class="comments-pagination" id="comments-pagination"></div>
                </div>
            </div>
        `;
        
        
        document.getElementById('back-btn').addEventListener('click', () => {
            window.history.back();
        });
        
        
        const likeBtn = document.getElementById('detail-like-btn');
        if (post.userScore === 1) {
            likeBtn.classList.add('liked');
        }
        likeBtn.addEventListener('click', async () => {
            try {
                const oldScore = parseInt(likeBtn.querySelector('span').textContent) || 0;
                const res = await api.react('post', post.postId, 1);
                const newScore = res.data.totalScore;
                likeBtn.querySelector('span').textContent = newScore;
                if (newScore < oldScore) {
                    likeBtn.classList.remove('liked');
                } else {
                    likeBtn.classList.add('liked');
                }
            } catch (err) {
                console.error('Failed to react:', err);
            }
        });
        
        
        const commentInput = document.getElementById('comment-input');
        const commentSubmitBtn = document.getElementById('comment-submit-btn');
        
        
        const commentCharCount = document.getElementById('comment-char-count');
        commentInput.addEventListener('input', () => {
            if (commentCharCount) {
                commentCharCount.textContent = `${commentInput.value.length}/300`;
            }
        });

        
        commentInput.addEventListener('beforeinput', (e) => {
            if (e.data) {
                for (const ch of e.data) {
                    if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126) {
                        e.preventDefault();
                        showInputError(commentInput.closest('.comment-form'), 'Only English characters are allowed.');
                        return;
                    }
                }
            }
        });

        commentSubmitBtn.addEventListener('click', async () => {
            const content = commentInput.value.trim();
            
            // Client-side validation for instant feedback (server validates too as fallback)
            const commentErr = validateLength(content, 3, 300, 'Comment');
            if (commentErr) {
                showInputError(commentInput.closest('.comment-form'), commentErr);
                return;
            }
            
            commentSubmitBtn.disabled = true;
            commentSubmitBtn.textContent = 'Posting...';
            
            try {
                await api.createComment(post.postId + '', content);
                commentInput.value = '';
                if (commentCharCount) commentCharCount.textContent = '0/300';
                
                loadComments(post.postId, 1, currentSortBy, currentSortOrder);
            } catch (err) {
                const msg = err.error || err.message || 'Failed to post comment. Please try again.';
                showInputError(commentInput.closest('.comment-form'), msg);
            } finally {
                commentSubmitBtn.disabled = false;
                commentSubmitBtn.textContent = 'Post Comment';
            }
        });
        
        
        let currentPage = 1;
        let currentSortBy = 'createdAt';
        let currentSortOrder = 'desc';
        
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSortBy = btn.dataset.sort;
                currentSortOrder = btn.dataset.order;
                currentPage = 1;
                loadComments(post.postId, currentPage, currentSortBy, currentSortOrder);
            });
        });
        
        
        document.querySelector('.sort-btn').classList.add('active');
        
        
        renderAllUserLists();
        
        
        loadComments(post.postId, currentPage, currentSortBy, currentSortOrder);
        
    } catch (err) {
        app.innerHTML = `<div class="error-state">${escapeHtml(err.message || 'Failed to load post')}</div>`;
    }
}

async function loadComments(postId, page = 1, sortBy = 'createdAt', sortOrder = 'desc') {
    const commentsList = document.getElementById('comments-list');
    const paginationEl = document.getElementById('comments-pagination');
    if (!commentsList) return;
    
    try {
        const res = await api.getComments(postId, page, 10, sortBy, sortOrder);
        const data = res.data;
        const comments = data?.comments || [];
        
        if (comments.length === 0 && page === 1) {
            commentsList.innerHTML = '<div class="empty-state">No comments yet. Be the first to comment!</div>';
            paginationEl.innerHTML = '';
            return;
        }
        
        commentsList.innerHTML = comments.map(comment => {
            const isLiked = comment.userScore === 1;
            const isCommentOwner = window.__user && window.__user.userId === comment.userId;
            return `
            <div class="comment-card">
                <div class="comment-header">
                    <div class="comment-avatar">${getInitials(comment.nickname)}</div>
                    <div class="comment-info">
                        <span class="comment-username">${escapeHtml(safeUpperCase(comment.nickname))}</span>
                        <span class="comment-time">${timeAgo(comment.createdAt)}</span>
                    </div>
                    ${isCommentOwner ? `
                    <div class="comment-menu-wrapper">
                        <button class="comment-menu">...</button>
                        <div class="comment-menu-dropdown">
                            <button class="comment-menu-item comment-menu-delete" data-comment-id="${comment.commentId}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                Delete Comment
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <p class="comment-body">${escapeHtml(comment.commentText || '')}</p>
                <div class="comment-actions">
                    <button class="action-btn like-btn comment-like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${comment.commentId}">
                        <svg width="16" height="14" viewBox="0 0 20 18" fill="none">
                            <path d="M10 17C10 17 2 11.5 2 6C2 3.5 4 2 6 2C8 2 10 4 10 4C10 4 12 2 14 2C16 2 18 3.5 18 6C18 11.5 10 17 10 17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span>${comment.score || 0}</span>
                    </button>
                </div>
            </div>
        `}).join('');
        
        
        document.querySelectorAll('.comment-like-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const commentId = parseInt(btn.dataset.commentId);
                try {
                    const oldScore = parseInt(btn.querySelector('span').textContent) || 0;
                    const res = await api.react('comment', commentId, 1);
                    const newScore = res.data.totalScore;
                    btn.querySelector('span').textContent = newScore;
                    if (newScore < oldScore) {
                        btn.classList.remove('liked');
                    } else {
                        btn.classList.add('liked');
                    }
                } catch (err) {
                    console.error('Failed to react on comment:', err);
                }
            });
        });

        
        document.querySelectorAll('.comment-menu').forEach(menuBtn => {
            const card = menuBtn.closest('.comment-card');
            const dropdown = menuBtn.nextElementSibling;

            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                document.querySelectorAll('.comment-menu-dropdown.open').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            });

            
            document.addEventListener('click', (e) => {
                if (!card.contains(e.target)) {
                    dropdown.classList.remove('open');
                }
            }, { once: false });

            
            const deleteBtn = dropdown.querySelector('.comment-menu-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('open');
                    if (confirm('Are you sure you want to delete this comment?')) {
                        try {
                            const commentId = parseInt(deleteBtn.dataset.commentId);
                            await api.deleteComment(commentId);
                            
                            loadComments(postId, page, sortBy, sortOrder);
                        } catch (err) {
                            console.error('Failed to delete comment:', err);
                            alert(err.message || 'Failed to delete comment');
                        }
                    }
                });
            }
        });
        
        
        const commentCountSpan = document.querySelector('#detail-comment-btn span');
        if (commentCountSpan) {
            commentCountSpan.textContent = data.totalElements || comments.length;
        }
        
        
        renderPagination(paginationEl, data, postId, sortBy, sortOrder);
        
    } catch (err) {
        commentsList.innerHTML = '<div class="empty-state">Failed to load comments.</div>';
        paginationEl.innerHTML = '';
    }
}

function renderPagination(paginationEl, data, postId, sortBy, sortOrder) {
    if (!data || data.totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    const currentPage = data.pageNumber;
    const totalPages = data.totalPages;
    
    let html = '<div class="pagination-controls">';
    
    
    html += `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Previous
    </button>`;
    
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        html += `<button class="pagination-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
        html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    
    html += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
        Next
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
    </button>`;
    
    html += '</div>';
    
    paginationEl.innerHTML = html;
    
    
    paginationEl.querySelectorAll('.pagination-btn').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page)) {
                loadComments(postId, page, sortBy, sortOrder);
            }
        });
    });
}

function getInitials(name) {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
}