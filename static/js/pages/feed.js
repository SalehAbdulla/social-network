import { api } from '../api.js';
import { router } from '../router.js';
import { escapeHtml, safeUpperCase, timeAgo, showInputError } from '../utils.js';

let currentPage = 1;
let currentSort = 'createdAt';
let currentSortOrder = 'desc';
let currentCategory = 'all';
let loading = false;
let hasMore = true;

export async function renderFeed(app, params, queryString) {
    
    if (queryString) {
        const qs = new URLSearchParams(queryString);
        const catFromQs = qs.get('category');
        if (catFromQs) {
            currentCategory = catFromQs;
        }
    }
    app.innerHTML = `
        <div class="feed-container">
            <div class="feed-header">
                <div class="feed-header-left">
                    <div class="feed-logo">
                        <span>forum</span><span class="dot"></span>
                    </div>
                </div>
                <div class="feed-header-right">
                    <div class="header-avatar" id="header-avatar">
                        ${window.__user ? getInitials(window.__user.nickname || window.__user.firstName) : '?'}
                    </div>
                </div>
            </div>

            <div class="categories-wrapper">
                <div class="categories-scroll" id="categories-scroll">
                    <button class="category-pill${currentCategory === 'all' ? ' active' : ''}" data-category="all">All</button>
                    <button class="category-pill${currentCategory === '1' ? ' active' : ''}" data-category="1">Tech</button>
                    <button class="category-pill${currentCategory === '2' ? ' active' : ''}" data-category="2">General</button>
                    <button class="category-pill${currentCategory === '3' ? ' active' : ''}" data-category="3">Dev</button>
                    <button class="category-pill${currentCategory === '4' ? ' active' : ''}" data-category="4">Gaming</button>
                    <button class="category-pill${currentCategory === '5' ? ' active' : ''}" data-category="5">Q&A</button>
                    <button class="category-pill${currentCategory === '6' ? ' active' : ''}" data-category="6">Random</button>
                    <button class="category-pill${currentCategory === '7' ? ' active' : ''}" data-category="7">Life</button>
                    <button class="category-pill${currentCategory === '8' ? ' active' : ''}" data-category="8">Sport</button>
                </div>
            </div>

            <div class="posts-feed" id="posts-feed">
                <div class="loading-spinner">Loading posts...</div>
            </div>

        </div>
    `;

    
    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentCategory = pill.dataset.category;
            currentPage = 1;
            hasMore = true;
            loadPosts(true);
        });
    });

    
    const fab = document.getElementById('fab-create');
    if (fab) {
        fab.style.display = 'flex';
    }

    currentPage = 1;
    hasMore = true;
    await loadPosts(true);

    const postsFeed = document.getElementById('posts-feed');
    postsFeed.addEventListener('scroll', () => {
        if (postsFeed.scrollTop + postsFeed.clientHeight >= postsFeed.scrollHeight - 200) {
            loadPosts(false);
        }
    });
}

async function loadPosts(reset = false) {
    if (loading || !hasMore) return;
    loading = true;

    const postsFeed = document.getElementById('posts-feed');
    if (reset) {
        postsFeed.innerHTML = '<div class="loading-spinner">Loading posts...</div>';
    }

    try {
        const catId = currentCategory === 'all' ? 0 : parseInt(currentCategory, 10);
        const res = await api.getPosts(currentPage, 10, currentSort, currentSortOrder, catId);
        const data = res.data;

        if (reset) {
            postsFeed.innerHTML = '';
        }

        if (data.posts.length === 0 && reset) {
            postsFeed.innerHTML = '<div class="empty-state">No posts yet. Be the first to post!</div>';
            hasMore = false;
            return;
        }

        console.log(data)

        data.posts.forEach(post => {
            postsFeed.appendChild(createPostElement(post));
        });

        currentPage++;
        hasMore = !data.lastPage;

        
        if (!hasMore && data.posts.length > 0) {
            const endMsg = document.createElement('div');
            endMsg.className = 'feed-end-message';
            endMsg.textContent = 'You\'ve reached the end of the feed';
            postsFeed.appendChild(endMsg);
        }
    } catch (err) {
        if (reset) {
            postsFeed.innerHTML = '<div class="empty-state">Failed to load posts. Try again later.</div>';
        }
    } finally {
        loading = false;
        const spinner = postsFeed.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
    }
}

const categoryNames = {
    '1': 'Tech', '2': 'General', '3': 'Dev', '4': 'Gaming',
    '5': 'Q&A', '6': 'Random', '7': 'Life', '8': 'Sport'
};

function createPostElement(post) {
    const catName = categoryNames[post.categoryId] || 'General';
    const isOwner = window.__user && window.__user.userId === post.userId;
    
    const div = document.createElement('div');
    div.className = 'post-card';
    div.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="post-avatar">${getInitials(post.nickname)}</div>
                <div class="post-user-info">
                    <span class="post-username">${escapeHtml(safeUpperCase(post.nickname))}</span>
                    <span class="post-meta-row">
                        <span class="post-time">${timeAgo(post.createdAt)}</span>
                        <span class="post-category-tag">${catName}</span>
                    </span>
                </div>
            </div>
            ${isOwner ? `
            <div class="post-menu-wrapper">
                <button class="post-menu">...</button>
                <div class="post-menu-dropdown">
                    <button class="post-menu-item post-menu-delete" data-post-id="${post.postId}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete Post
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
            <button class="action-btn like-btn" data-post-id="${post.postId}" data-score="1">
                <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
                    <path d="M10 17C10 17 2 11.5 2 6C2 3.5 4 2 6 2C8 2 10 4 10 4C10 4 12 2 14 2C16 2 18 3.5 18 6C18 11.5 10 17 10 17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>${post.score || 0}</span>
            </button>
            <button class="action-btn comment-btn" data-post-id="${post.postId}">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 4C2 3.44772 2.44772 3 3 3H17C17.5523 3 18 3.44772 18 4V14C18 14.5523 17.5523 15 17 15H6L3 18V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>${post.commentsCounter || 0}</span>
            </button>
        </div>
    `;

    
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn') && !e.target.closest('.post-menu') && !e.target.closest('.post-menu-item')) {
            router.navigate(`post/${post.postId}`);
        }
    });

    
    const likeBtn = div.querySelector('.like-btn');
    
    if (post.userScore === 1) {
        likeBtn.classList.add('liked');
    }
    likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
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

    
    const commentBtn = div.querySelector('.comment-btn');
    commentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        router.navigate(`post/${post.postId}`);
    });

    
    if (isOwner) {
        const menuBtn = div.querySelector('.post-menu');
        const dropdown = div.querySelector('.post-menu-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        
        document.addEventListener('click', (e) => {
            if (!div.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });

        
        const deleteBtn = div.querySelector('.post-menu-delete');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.classList.remove('open');
            if (confirm('Are you sure you want to delete this post?')) {
                try {
                    await api.deletePost(post.postId);
                    div.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    div.style.opacity = '0';
                    div.style.transform = 'scale(0.95)';
                    setTimeout(() => div.remove(), 300);
                } catch (err) {
                    const msg = err.error || err.message || 'Failed to delete post. Please try again.';
                    showInputError(div, msg);
                }
            }
        });
    }

    return div;
}

function getInitials(name) {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
}
