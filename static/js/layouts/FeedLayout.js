
import { createFeedHeader } from '../components/FeedHeader.js';
import { createUsersScroll } from '../components/UsersScroll.js';
import { createCategoryPills } from '../components/CategoryPills.js';

export function createFeedLayout(contentArea, options = {}) {
    const {
        showUsers = true,
        showCategories = true,
        onCategoryChange = null,
    } = options;
    
    const container = document.createElement('div');
    container.className = 'feed-container';
    
    
    container.appendChild(createFeedHeader());
    
    
    if (showUsers) {
        container.appendChild(createUsersScroll());
    }
    
    
    if (showCategories) {
        container.appendChild(createCategoryPills('all', onCategoryChange));
    }
    
    
    if (typeof contentArea === 'function') {
        const area = document.createElement('div');
        area.className = 'posts-feed';
        area.id = 'posts-feed';
        contentArea(area);
        container.appendChild(area);
    } else if (contentArea instanceof HTMLElement) {
        container.appendChild(contentArea);
    }
    
    return container;
}
