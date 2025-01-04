let ws;

function connectWebSocket() {
    try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
        
        ws.onopen = () => {
            document.getElementById('connectionStatus').className = 'text-green-500 mr-2';
            document.getElementById('connectionText').textContent = 'Connected';
            subscribeToLeague(document.getElementById('leagueSelect').value);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                updateDashboard(data);
            } catch (error) {
                console.error('WebSocket message error:', error);
                document.getElementById('connectionStatus').className = 'text-yellow-500 mr-2';
                document.getElementById('connectionText').textContent = 'Data Error';
            }
        };

        ws.onclose = () => {
            document.getElementById('connectionStatus').className = 'text-red-500 mr-2';
            document.getElementById('connectionText').textContent = 'Disconnected';
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            document.getElementById('connectionStatus').className = 'text-red-500 mr-2';
            document.getElementById('connectionText').textContent = 'Connection Failed';
        };
    } catch (error) {
        console.error('WebSocket connection error:', error);
        document.getElementById('connectionStatus').className = 'text-red-500 mr-2';
        document.getElementById('connectionText').textContent = 'Connection Failed';
        setTimeout(connectWebSocket, 5000);
    }
}

function subscribeToLeague(league) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', league }));
    }
}

// Initialize WebSocket connection
connectWebSocket();          document.getElementById('connectionStatus').className = 'text-red-500 mr-2';
            document.getElementById('connectionText').textContent = 'Connection Failed';
        };
    } catch (error) {
        console.error('WebSocket connection error:', error);
        document.getElementById('connectionStatus').className = 'text-red-500 mr-2';
        document.getElementById('connectionText').textContent = 'Connection Failed';
        setTimeout(connectWebSocket, 5000);
    }
}

function subscribeToLeague(league) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', league }));
    }
}

connectWebSocket();