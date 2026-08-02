
import { getInitials } from '../utils.js';

export function createAvatar(name, size = 'md', onClick = null) {
    const sizes = { sm: '32px', md: '36px', lg: '44px' };
    const fontSizes = { sm: '11px', md: '12px', lg: '14px' };
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.width = sizes[size] || sizes.md;
    avatar.style.height = sizes[size] || sizes.md;
    avatar.style.fontSize = fontSizes[size] || fontSizes.md;
    avatar.style.cursor = onClick ? 'pointer' : 'default';
    avatar.textContent = getInitials(name);
    
    if (onClick) {
        avatar.addEventListener('click', onClick);
    }
    
    return avatar;
}

export function createAvatarWithStatus(name, isOnline, size = 'lg') {
    const wrapper = document.createElement('div');
    wrapper.className = 'avatar-wrapper';
    wrapper.style.width = size === 'lg' ? '44px' : '40px';
    wrapper.style.height = size === 'lg' ? '44px' : '40px';
    
    const avatar = createAvatar(name, size);
    wrapper.appendChild(avatar);
    
    const dot = document.createElement('div');
    dot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
    wrapper.appendChild(dot);
    
    return wrapper;
}