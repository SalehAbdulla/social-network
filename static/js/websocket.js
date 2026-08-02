
class WSConnection {
    constructor() {
        this.ws = null;
        this.reconnectTimer = null;
        this.listeners = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.intentionalClose = false;
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.intentionalClose = false;

        
        if (window.__isAuthenticated !== true) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);
        } catch (err) {
            console.error('[WS] Connection error:', err);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[WS] Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        };

        this.ws.onmessage = (event) => {
            // The server may batch multiple JSON messages into one frame,
            // separated by newlines. Parse each line individually.
            for (const line of event.data.split('\n')) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    this.emit(data.type, data.payload || data);
                } catch (err) {
                    console.error('[WS] Failed to parse message:', err);
                }
            }
        };

        this.ws.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.emit('disconnected');
            if (event.code !== 1000 && !this.intentionalClose) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (err) => {
            console.error('[WS] Error:', err);
        };
    }

    disconnect() {
        this.intentionalClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close(1000);
            this.ws = null;
        }
        this.isConnected = false;
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WS] Max reconnect attempts reached');
            return;
        }
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[WS] Cannot send, not connected');
            return false;
        }
        const message = JSON.stringify({ type, payload });
        this.ws.send(message);
        return true;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.listeners.get(event)?.delete(callback);
    }

    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event, data) {
        this.listeners.get(event)?.forEach(cb => {
            try { cb(data); } catch (err) { console.error('[WS] Listener error:', err); }
        });
    }
}

export const ws = new WSConnection();