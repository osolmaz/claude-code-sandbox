// Terminal and Socket.IO setup
let term;
let socket;
let fitAddon;
let webLinksAddon;
let containerId;

// Get container ID from URL only
const urlParams = new URLSearchParams(window.location.search);
containerId = urlParams.get('container');

// Initialize the terminal
function initTerminal() {
    term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5'
        },
        allowProposedApi: true
    });

    // Load addons
    fitAddon = new FitAddon.FitAddon();
    webLinksAddon = new WebLinksAddon.WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Open terminal in the DOM
    term.open(document.getElementById('terminal'));
    
    // Fit terminal to container
    fitAddon.fit();

    // Handle window resize
    window.addEventListener('resize', () => {
        fitAddon.fit();
        if (socket && socket.connected) {
            socket.emit('resize', {
                cols: term.cols,
                rows: term.rows
            });
        }
    });

    // Handle terminal input
    term.onData(data => {
        if (socket && socket.connected) {
            socket.emit('input', data);
        }
    });

    // Show welcome message
    term.writeln('\x1b[1;32mWelcome to Claude Code Sandbox Terminal\x1b[0m');
    term.writeln('\x1b[90mConnecting to container...\x1b[0m');
    term.writeln('');
}

// Initialize Socket.IO connection
function initSocket() {
    socket = io();
    window.socket = socket; // Make it globally accessible for debugging

    socket.on('connect', () => {
        console.log('Connected to server');
        updateStatus('connecting', 'Attaching to container...');
        
        // Hide loading spinner
        document.getElementById('loading').style.display = 'none';

        // Only use container ID from URL, never from cache
        const urlParams = new URLSearchParams(window.location.search);
        const currentContainerId = urlParams.get('container');
        
        if (currentContainerId) {
            containerId = currentContainerId;
            socket.emit('attach', { 
                containerId: currentContainerId,
                cols: term.cols,
                rows: term.rows
            });
        } else {
            // No container ID in URL, fetch available containers
            fetchContainerList();
        }
    });

    socket.on('attached', (data) => {
        console.log('Attached to container:', data.containerId);
        containerId = data.containerId;
        updateStatus('connected', `Connected to ${data.containerId.substring(0, 12)}`);
        
        // Don't clear terminal on attach - preserve existing content
        
        // Send initial resize
        socket.emit('resize', {
            cols: term.cols,
            rows: term.rows
        });
    });

    socket.on('output', (data) => {
        // Convert ArrayBuffer to Uint8Array if needed
        if (data instanceof ArrayBuffer) {
            data = new Uint8Array(data);
        }
        term.write(data);
    });

    socket.on('disconnect', () => {
        updateStatus('error', 'Disconnected from server');
        term.writeln('\r\n\x1b[1;31mServer connection lost. Click "Reconnect" to retry.\x1b[0m');
    });

    socket.on('container-disconnected', () => {
        updateStatus('error', 'Container disconnected');
        term.writeln('\r\n\x1b[1;31mContainer connection lost. Click "Reconnect" to retry.\x1b[0m');
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        updateStatus('error', 'Error: ' + error.message);
        term.writeln('\r\n\x1b[1;31mError: ' + error.message + '\x1b[0m');
        
        // If container not found, try to get a new one
        if (error.message && error.message.includes('no such container')) {
            containerId = null;
            
            // Try to fetch available containers
            setTimeout(() => {
                fetchContainerList();
            }, 1000);
        }
    });
}

// Fetch available containers
async function fetchContainerList() {
    try {
        const response = await fetch('/api/containers');
        const containers = await response.json();
        
        if (containers.length > 0) {
            // Use the first container
            containerId = containers[0].Id;
            socket.emit('attach', { 
                containerId,
                cols: term.cols,
                rows: term.rows
            });
        } else {
            updateStatus('error', 'No containers found');
            term.writeln('\x1b[1;31mNo Claude Code Sandbox containers found.\x1b[0m');
            term.writeln('\x1b[90mPlease start a container first.\x1b[0m');
        }
    } catch (error) {
        console.error('Failed to fetch containers:', error);
        updateStatus('error', 'Failed to fetch containers');
    }
}

// Update connection status
function updateStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    indicator.className = 'status-indicator ' + status;
    statusText.textContent = text;
}

// Control functions
function clearTerminal() {
    term.clear();
}

function reconnect() {
    if (socket && containerId) {
        // Don't clear terminal - preserve existing content
        term.writeln('\r\n\x1b[90mReconnecting...\x1b[0m');
        
        // Just emit attach again without disconnecting
        // This will reattach to the existing session
        socket.emit('attach', { 
            containerId: containerId,
            cols: term.cols,
            rows: term.rows
        });
    }
}

function copySelection() {
    const selection = term.getSelection();
    if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
            // Show temporary feedback
            const originalText = document.getElementById('status-text').textContent;
            updateStatus('connected', 'Copied to clipboard');
            setTimeout(() => {
                updateStatus('connected', originalText);
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTerminal();
    initSocket();
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+C for copy
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copySelection();
    }
    // Ctrl+Shift+V for paste
    else if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
            if (socket && socket.connected) {
                socket.emit('input', text);
            }
        });
    }
});