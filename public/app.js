// Terminal and Socket.IO setup
let term;
let socket;
let fitAddon;
let webLinksAddon;
let containerId;

// Input detection state
let isWaitingForInput = false;
let lastOutputTime = Date.now();
let lastNotificationTime = 0;
let idleTimer = null;
let isWaitingForLoadingAnimation = false;
let seenLoadingChars = new Set();
const IDLE_THRESHOLD = 1500; // 1.5 seconds of no output means waiting for input
const NOTIFICATION_COOLDOWN = 2000; // 2 seconds between notifications

// Claude's loading animation characters (unique characters only)
const LOADING_CHARS = ["✢", "✳", "✶", "✻", "✽", "✻", "✢", "·"];
const UNIQUE_LOADING_CHARS = new Set(LOADING_CHARS);

// Create notification sound using Web Audio API
let audioContext;
let notificationSound;

function initializeAudio() {
    try {
        if (window.AudioContext || window.webkitAudioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created:', audioContext.state);

            // Create a simple notification beep
            function createBeep(frequency, duration) {
                try {
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();

                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);

                    oscillator.frequency.value = frequency;
                    oscillator.type = 'sine';

                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + duration);

                    return true;
                } catch (error) {
                    console.error('Error creating beep:', error);
                    return false;
                }
            }

            notificationSound = () => {
                console.log('Playing notification sound, audio context state:', audioContext.state);

                // Try Web Audio API first
                try {
                    const beep1 = createBeep(800, 0.1);
                    setTimeout(() => createBeep(1000, 0.1), 100);
                    setTimeout(() => createBeep(1200, 0.15), 200);
                    return beep1;
                } catch (error) {
                    console.error('Web Audio API failed, trying fallback:', error);

                    // Fallback to HTML audio element
                    const audioElement = document.getElementById('notification-sound');
                    if (audioElement) {
                        audioElement.currentTime = 0;
                        audioElement.play().catch(e => console.error('Fallback audio failed:', e));
                    }
                    return false;
                }
            };
        } else {
            // No Web Audio API support, use fallback only
            console.log('Web Audio API not supported, using fallback audio');
            notificationSound = () => {
                const audioElement = document.getElementById('notification-sound');
                if (audioElement) {
                    audioElement.currentTime = 0;
                    audioElement.play().catch(e => console.error('Fallback audio failed:', e));
                }
            };
        }

        console.log('Audio initialized successfully');
    } catch (error) {
        console.error('Failed to initialize audio:', error);

        // Last resort fallback
        notificationSound = () => {
            console.log('Audio not available');
        };
    }
}

// Idle detection functions
function resetIdleTimer() {
    // Clear any existing timer
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    // Reset waiting state only if we're not waiting for loading animation
    if (!isWaitingForLoadingAnimation) {
        isWaitingForInput = false;
    }

    // Update last output time
    lastOutputTime = Date.now();

    // Only start a new timer if we've seen the loading animation or not waiting for it
    if (!isWaitingForLoadingAnimation || seenLoadingChars.size === UNIQUE_LOADING_CHARS.size) {
        idleTimer = setTimeout(() => {
            onIdleDetected();
        }, IDLE_THRESHOLD);
    }
}

function onIdleDetected() {
    // Claude has stopped outputting for 1.5 seconds - likely waiting for input
    // But only trigger if we're not waiting for loading animation or have seen all chars
    if (!isWaitingForInput && (!isWaitingForLoadingAnimation || seenLoadingChars.size === UNIQUE_LOADING_CHARS.size)) {
        isWaitingForInput = true;

        // Check cooldown to avoid spamming notifications
        const now = Date.now();
        if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
            lastNotificationTime = now;

            // Check if sound is enabled
            const soundEnabled = document.getElementById('soundEnabled').checked;

            // Play notification sound if enabled
            if (soundEnabled && notificationSound) {
                try {
                    // Resume audio context if suspended (browser requirement)
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    notificationSound();
                } catch (error) {
                    console.error('Failed to play notification sound:', error);
                }
            }

            // Always show visual notification
            const originalStatus = document.getElementById('status-text').textContent;
            updateStatus('connected', '⚠️ Input needed');

            // Flash the page title
            const originalTitle = document.title;
            let titleFlashInterval = setInterval(() => {
                document.title = document.title === originalTitle ? '⚠️ Input needed' : originalTitle;
            }, 1000);

            // Restore original status and title after a delay
            setTimeout(() => {
                if (document.getElementById('status-text').textContent === '⚠️ Input needed') {
                    updateStatus('connected', originalStatus);
                }
                clearInterval(titleFlashInterval);
                document.title = originalTitle;
            }, 5000);
        }
    }
}

// Check if output contains loading characters
function checkForLoadingChars(text) {
    for (const char of text) {
        if (LOADING_CHARS.includes(char)) {
            seenLoadingChars.add(char);

            // If we've seen all unique loading chars, we can stop waiting
            if (seenLoadingChars.size === UNIQUE_LOADING_CHARS.size && isWaitingForLoadingAnimation) {
                console.log('Seen all loading characters, Claude has started processing');
                isWaitingForLoadingAnimation = false;
                // Reset the idle timer now that we know Claude is processing
                resetIdleTimer();
            }
        }
    }
}

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

            // Cancel idle timer when user provides input
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }

            // When user provides input, start waiting for loading animation
            if (isWaitingForInput) {
                isWaitingForInput = false;
                isWaitingForLoadingAnimation = true;
                seenLoadingChars.clear(); // Clear seen loading chars
                console.log('User provided input, waiting for loading animation...');
            }
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

        // Start idle detection
        resetIdleTimer();
    });

    socket.on('output', (data) => {
        // Convert ArrayBuffer to Uint8Array if needed
        if (data instanceof ArrayBuffer) {
            data = new Uint8Array(data);
        }
        term.write(data);

        // Convert to string to check for loading characters
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(data);

        // Check for loading characters if we're waiting for them
        if (isWaitingForLoadingAnimation) {
            checkForLoadingChars(text);
        }

        // Reset idle timer on any output
        resetIdleTimer();
    });

    socket.on('disconnect', () => {
        updateStatus('error', 'Disconnected from server');
        term.writeln('\r\n\x1b[1;31mServer connection lost. Click "Reconnect" to retry.\x1b[0m');

        // Clear idle timer on disconnect
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    });

    socket.on('container-disconnected', () => {
        updateStatus('error', 'Container disconnected');
        term.writeln('\r\n\x1b[1;31mContainer connection lost. Click "Reconnect" to retry.\x1b[0m');

        // Clear idle timer on disconnect
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
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

    // Initialize audio on first user interaction (browser requirement)
    document.addEventListener('click', function initAudioOnInteraction() {
        if (!audioContext) {
            initializeAudio();
        }
        // Remove listener after first interaction
        document.removeEventListener('click', initAudioOnInteraction);
    }, { once: true });

    // Also try to initialize on keyboard interaction
    document.addEventListener('keydown', function initAudioOnKeyboard() {
        if (!audioContext) {
            initializeAudio();
        }
        // Remove listener after first interaction
        document.removeEventListener('keydown', initAudioOnKeyboard);
    }, { once: true });

    // Expose variables for testing with getters
    Object.defineProperty(window, 'term', { get: () => term });
    Object.defineProperty(window, 'isWaitingForInput', { get: () => isWaitingForInput });
    Object.defineProperty(window, 'isWaitingForLoadingAnimation', { get: () => isWaitingForLoadingAnimation });
    Object.defineProperty(window, 'seenLoadingChars', { get: () => seenLoadingChars });
    Object.defineProperty(window, 'lastOutputTime', { get: () => lastOutputTime });
    Object.defineProperty(window, 'lastNotificationTime', { get: () => lastNotificationTime });
    Object.defineProperty(window, 'audioContext', { get: () => audioContext });
    Object.defineProperty(window, 'notificationSound', {
        get: () => notificationSound,
        set: (value) => { notificationSound = value; }
    });
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