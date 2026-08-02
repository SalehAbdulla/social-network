
import { api } from '../api.js';
import { router } from '../router.js';
import { createAvatar } from './Avatar.js';
import { escapeHtml, timeAgo } from '../utils.js';

export function createPostCard(post) {
    const card = document.createElement('div');
    card.className = 'post-card';
    
    const avatar = createAvatar(post.nickname, 'sm');

    const isOwner = window.__user && window.__user.userId === post.userId;
    
    card.innerHTML = `
        <div class="post-header">
            <div class="post-user"></div>
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
    
    
    const postUser = card.querySelector('.post-user');
    postUser.appendChild(avatar);
    
    const userInfo = document.createElement('div');
    userInfo.className = 'post-user-info';
    userInfo.innerHTML = `
        <span class="post-username">${escapeHtml((post.nickname || '').toUpperCase())}</span>
        <span class="post-time">${timeAgo(post.createdAt)}</span>
    `;
    postUser.appendChild(userInfo);
    
    
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn') && !e.target.closest('.post-menu')) {
            router.navigate(`post/${post.postId}`);
        }
    });
    
    
    const likeBtn = card.querySelector('.like-btn');
    
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
    
    
    const commentBtn = card.querySelector('.comment-btn');
    commentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        router.navigate(`post/${post.postId}`);
    });

    
    if (isOwner) {
        const menuBtn = card.querySelector('.post-menu');
        const dropdown = card.querySelector('.post-menu-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        
        document.addEventListener('click', (e) => {
            if (!card.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        }, { once: false });

        
        const deleteBtn = card.querySelector('.post-menu-delete');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.classList.remove('open');
            if (confirm('Are you sure you want to delete this post?')) {
                try {
                    await api.deletePost(post.postId);
                    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    setTimeout(() => card.remove(), 300);
                } catch (err) {
                    console.error('Failed to delete post:', err);
                    alert(err.message || 'Failed to delete post');
                }
            }
        });
    }
    
    return card;
}
