class LiveUpdates {
    constructor() {
        this.container = document.getElementById('liveUpdates');
        this.content = document.getElementById('liveContent');
        this.setupWebSocket();
    }

    setupWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

        this.ws.onopen = () => this.handleConnection(true);
        this.ws.onclose = () => this.handleConnection(false);
        this.ws.onmessage = (event) => this.handleMessage(event);
    }

    handleConnection(isConnected) {
        const status = document.getElementById('connectionStatus');
        const text = document.getElementById('connectionText');
        
        if (isConnected) {
            status.className = 'text-green-500 mr-2';
            text.textContent = 'Connected';
        } else {
            status.className = 'text-red-500 mr-2';
            text.textContent = 'Disconnected';
            setTimeout(() => this.setupWebSocket(), 3000);
        }
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.showUpdate(data);
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }

    showUpdate(data) {
        this.container.classList.remove('hidden');
        
        const update = document.createElement('div');
        update.className = 'bg-blue-900/30 p-4 rounded-lg mb-2 animate-fade-in';
        update.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-bold">${data.type}</span>
                <span class="text-sm text-gray-400">${new Date().toLocaleTimeString()}</span>
            </div>
            <p class="mt-2">${data.message}</p>
        `;

        this.content.insertBefore(update, this.content.firstChild);

        // Remove old updates
        if (this.content.children.length > 5) {
            this.content.removeChild(this.content.lastChild);
        }
    }
}

export default LiveUpdates;