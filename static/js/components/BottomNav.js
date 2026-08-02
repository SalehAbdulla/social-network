
import { router } from '../router.js';

const navItems = [
    { route: 'feed', label: 'Home', icon: 'home' },
    { route: 'chat', label: 'Chat', icon: 'chat' },
    { route: 'notifications', label: 'Notifications', icon: 'bell' },
];

const icons = {
    home: `<svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path d="M2 10L10 2L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 8V16H16V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    chat: `<svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path d="M2 4C2 3.44772 2.44772 3 3 3H17C17.5523 3 18 3.44772 18 4V14C18 14.5523 17.5523 15 17 15H6L3 18V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    bell: `<svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C7.79086 2 6 3.79086 6 6V9C6 9.55228 5.55228 10 5 10H4V12H16V10H15C14.4477 10 14 9.55228 14 9V6C14 3.79086 12.2091 2 10 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 14V15C8 16.1046 8.89543 17 10 17C11.1046 17 12 16.1046 12 15V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
};

export function createBottomNav(activeRoute = 'feed') {
    const nav = document.createElement('div');
    nav.className = 'bottom-nav';
    
    navItems.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `nav-item${activeRoute === item.route ? ' active' : ''}`;
        btn.dataset.route = item.route;
        btn.innerHTML = icons[item.icon];
        btn.setAttribute('aria-label', item.label);
        
        btn.addEventListener('click', () => {
            router.navigate(item.route);
        });
        
        nav.appendChild(btn);
    });
    
    return nav;
}