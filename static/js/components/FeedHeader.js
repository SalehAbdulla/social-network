
import { createLogo } from './Logo.js';
import { createAvatar } from './Avatar.js';
import { router } from '../router.js';

export function createFeedHeader() {
    const header = document.createElement('div');
    header.className = 'feed-header';
    
    const left = document.createElement('div');
    left.className = 'feed-header-left';
    left.appendChild(createLogo());
    
    const right = document.createElement('div');
    right.className = 'feed-header-right';
    
    const name = window.__user ? (window.__user.nickname || window.__user.firstName) : '?';
    const avatar = createAvatar(name, 'md', () => {
        router.navigate('profile');
    });
    right.appendChild(avatar);
    
    header.appendChild(left);
    header.appendChild(right);
    
    return header;
}