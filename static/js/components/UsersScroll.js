
import { router } from '../router.js';
import { renderAllUserLists } from './UsersManager.js';

export function createUsersScroll() {
    const wrapper = document.createElement('div');
    wrapper.className = 'users-wrapper';
    
    const scroll = document.createElement('div');
    scroll.className = 'users-scroll';
    scroll.id = 'users-scroll';
    scroll.innerHTML = '<div class="loading-spinner">Loading users...</div>';
    
    wrapper.appendChild(scroll);
    
    // UsersManager handles all user list rendering via WebSocket real-time updates
    renderAllUserLists();
    
    return wrapper;
}
