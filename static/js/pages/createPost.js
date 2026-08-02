import { api } from '../api.js';
import { router } from '../router.js';
import { escapeHtml, showInputError, validateLength } from '../utils.js';

const categories = [
    { id: 1, name: 'Tech' },
    { id: 2, name: 'General' },
    { id: 3, name: 'Dev' },
    { id: 4, name: 'Gaming' },
    { id: 5, name: 'Q&A' },
    { id: 6, name: 'Random' },
    { id: 7, name: 'Life' },
    { id: 8, name: 'Sport' },
];

export async function renderCreatePost(app) {
    app.innerHTML = `
        <div class="create-post-page">
            <div class="create-post-header">
                <button class="back-btn" id="create-back-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <span class="create-post-title">Create Post</span>
            </div>

            <div class="create-post-card">
                <div class="create-post-form">
                    <div class="create-field">
                        <label class="create-label" for="create-title">Title</label>
                        <input 
                            type="text" 
                            id="create-title" 
                            class="glass-input create-input" 
                            placeholder="What's on your mind?"
                            maxlength="30"
                            data-ascii="true"
                            autocomplete="off"
                        />
                        <div class="create-field-hint">
                            <span class="create-char-count" id="title-char-count">  0/30 </span>
                            <span class="create-ascii-hint">  English characters only </span>
                        </div>
                    </div>

                    <div class="create-field">
                        <label class="create-label" for="create-content">Content</label>
                        <textarea 
                            id="create-content" 
                            class="create-textarea" 
                            placeholder="Share your thoughts..."
                            maxlength="500"
                            rows="5"
                            data-ascii="true"
                        ></textarea>
                        <div class="create-field-hint">
                            <span class="create-char-count" id="content-char-count">0/500 </span>
                            
                            <span class="create-ascii-hint">  English characters only</span>
                        </div>
                    </div>

                    <div class="create-field">
                        <label class="create-label">Category</label>
                        <div class="create-categories" id="create-categories">
                            ${categories.map(cat => `
                                <button class="create-cat-pill" data-category-id="${cat.id}">${cat.name}</button>
                            `).join('')}
                        </div>
                    </div>

                    <div class="create-error" id="create-error" style="display:none;"></div>

                    <button class="glass-btn create-submit-btn" id="create-submit-btn" disabled>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5v14M5 12h14"/>
                        </svg>
                        Create Post
                    </button>
                </div>
            </div>
        </div>
    `;

    
    document.getElementById('create-back-btn').addEventListener('click', () => {
        window.history.back();
    });

    const titleInput = document.getElementById('create-title');
    const contentTextarea = document.getElementById('create-content');
    const submitBtn = document.getElementById('create-submit-btn');
    const errorEl = document.getElementById('create-error');
    const titleCharCount = document.getElementById('title-char-count');
    const contentCharCount = document.getElementById('content-char-count');
    const categoryPills = document.querySelectorAll('.create-cat-pill');

    let selectedCategory = null;

    
    titleInput.addEventListener('input', () => {
        titleCharCount.textContent = `${titleInput.value.length}/30`;
        validateForm();
    });

    contentTextarea.addEventListener('input', () => {
        contentCharCount.textContent = `${contentTextarea.value.length}/500`;
        validateForm();
    });

    
    document.querySelectorAll('[data-ascii="true"]').forEach(input => {
        input.addEventListener('beforeinput', (e) => {
            if (e.data) {
                for (const ch of e.data) {
                    if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126) {
                        e.preventDefault();
                        showInputError(input.closest('.create-field'), 'Only English characters are allowed.');
                        return;
                    }
                }
            }
        });
    });

    
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedCategory = parseInt(pill.dataset.categoryId);
            validateForm();
        });
    });

    function validateForm() {
        const title = titleInput.value.trim();
        const content = contentTextarea.value.trim();
        const titleValid = title.length >= 3 && title.length <= 30;
        const contentValid = content.length >= 10 && content.length <= 500;
        const categoryValid = selectedCategory !== null && selectedCategory >= 1 && selectedCategory <= 8;

        if (titleValid && contentValid && categoryValid) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }
    }

    
    submitBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const content = contentTextarea.value.trim();

        // Client-side validation for instant feedback (server validates too as fallback)
        if (title.length < 3 || title.length > 30) {
            showError('Title must be between 3 and 30 characters');
            return;
        }
        if (content.length < 10 || content.length > 500) {
            showError('Content must be between 10 and 500 characters');
            return;
        }
        if (!selectedCategory || selectedCategory < 1 || selectedCategory > 8) {
            showError('Please select a category');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        hideError();

        try {
            const res = await api.createPost(title, content, selectedCategory);
            if (res.success && res.data) {
                router.navigate(`post/${res.data.postId}`);
            } else {
                showError(res.message || 'Failed to create post. Please try again.');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Create Post
                `;
            }
        } catch (err) {
            const msg = err.error || err.message || 'Failed to create post. Please try again.';
            showError(msg);
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                Create Post
            `;
        }
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }

    function hideError() {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
}