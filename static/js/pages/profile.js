import { api } from '../api.js';
import { router } from '../router.js';
import { escapeHtml, safeUpperCase } from '../utils.js';
import { ws } from '../websocket.js';

export function renderProfile(app) {
    const user = window.__user || {};
    const name = user.nickname || user.firstName || 'User';
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || name;
    const initials = name.substring(0, 2).toUpperCase();

    app.innerHTML = `
        <div class="profile-page">
            <div class="profile-header">
            
            </div>

            <div class="profile-card">
                <div class="profile-avatar-section">
                    <div class="profile-avatar-large">${initials}</div>
                    <h2 class="profile-name">${escapeHtml(safeUpperCase(name))}</h2>
                    ${user.nickname ? `<p class="profile-nickname">@${escapeHtml(user.nickname)}</p>` : ''}
                </div>

                <div class="glass-divider"></div>

                <div class="profile-details">
                    <div class="profile-detail-row">
                        <span class="profile-detail-label">Email</span>
                        <span class="profile-detail-value">${escapeHtml(user.email || '-')}</span>
                    </div>
                    <div class="profile-detail-row">
                        <span class="profile-detail-label">First Name</span>
                        <span class="profile-detail-value">${escapeHtml(user.firstName || '-')}</span>
                    </div>
                    <div class="profile-detail-row">
                        <span class="profile-detail-label">Last Name</span>
                        <span class="profile-detail-value">${escapeHtml(user.lastName || '-')}</span>
                    </div>
                </div>

                <div class="glass-divider"></div>

                <div class="profile-actions">
                    <button class="glass-btn profile-logout-btn" id="profile-logout-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9"/>
                            <path d="M16 17L21 12L16 7"/>
                            <path d="M21 12H9"/>
                        </svg>
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    `;

    
    document.getElementById('profile-logout-btn').addEventListener('click', async () => {
        const btn = document.getElementById('profile-logout-btn');
        btn.disabled = true;
        btn.textContent = 'Signing out...';

        // Signal the server to broadcast offline status immediately
        ws.send('user_offline');
        // Close the socket so the hub unregisters this user even if the
        // signal above is lost — otherwise we stay "online" for everyone.
        ws.disconnect();

        try {
            await api.logout();
        } catch (err) {
            console.error('Logout request failed:', err);
        }

        window.__isAuthenticated = false;
        window.__user = null;
        router.navigate('login');
    });
}

