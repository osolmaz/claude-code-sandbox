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
let originalPageTitle = "";
const IDLE_THRESHOLD = 1500; // 1.5 seconds of no output means waiting for input
const NOTIFICATION_COOLDOWN = 2000; // 2 seconds between notifications

// Claude's loading animation characters (unique characters only)
const LOADING_CHARS = ["✢", "✶", "✻", "✽", "✻", "✢", "·"];
const UNIQUE_LOADING_CHARS = new Set(LOADING_CHARS);

// Create notification sound using Web Audio API
let audioContext;
let notificationSound;

function initializeAudio() {
  try {
    if (window.AudioContext || window.webkitAudioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log("Audio context created:", audioContext.state);

      // Create a simple notification beep
      function createBeep(frequency, duration) {
        try {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.frequency.value = frequency;
          oscillator.type = "sine";

          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + duration,
          );

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);

          return true;
        } catch (error) {
          console.error("Error creating beep:", error);
          return false;
        }
      }

      notificationSound = () => {
        console.log(
          "Playing notification sound, audio context state:",
          audioContext.state,
        );

        // Try Web Audio API first
        try {
          const beep1 = createBeep(800, 0.1);
          setTimeout(() => createBeep(1000, 0.1), 100);
          setTimeout(() => createBeep(1200, 0.15), 200);
          return beep1;
        } catch (error) {
          console.error("Web Audio API failed, trying fallback:", error);

          // Fallback to HTML audio element
          const audioElement = document.getElementById("notification-sound");
          if (audioElement) {
            audioElement.currentTime = 0;
            audioElement
              .play()
              .catch((e) => console.error("Fallback audio failed:", e));
          }
          return false;
        }
      };
    } else {
      // No Web Audio API support, use fallback only
      console.log("Web Audio API not supported, using fallback audio");
      notificationSound = () => {
        const audioElement = document.getElementById("notification-sound");
        if (audioElement) {
          audioElement.currentTime = 0;
          audioElement
            .play()
            .catch((e) => console.error("Fallback audio failed:", e));
        }
      };
    }

    console.log("Audio initialized successfully");
  } catch (error) {
    console.error("Failed to initialize audio:", error);

    // Last resort fallback
    notificationSound = () => {
      console.log("Audio not available");
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
  if (
    !isWaitingForLoadingAnimation ||
    seenLoadingChars.size === UNIQUE_LOADING_CHARS.size
  ) {
    idleTimer = setTimeout(() => {
      onIdleDetected();
    }, IDLE_THRESHOLD);
  }
}

function onIdleDetected() {
  console.log("[IDLE] Idle detected. State:", {
    isWaitingForInput,
    isWaitingForLoadingAnimation,
    seenLoadingCharsCount: seenLoadingChars.size,
    requiredCharsCount: UNIQUE_LOADING_CHARS.size,
  });

  // Claude has stopped outputting for 1.5 seconds - likely waiting for input
  // But only trigger if we're not waiting for loading animation or have seen all chars
  if (
    !isWaitingForInput &&
    (!isWaitingForLoadingAnimation ||
      seenLoadingChars.size === UNIQUE_LOADING_CHARS.size)
  ) {
    isWaitingForInput = true;
    console.log("[IDLE] ✓ Triggering input needed notification");

    // Check cooldown to avoid spamming notifications
    const now = Date.now();
    if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
      lastNotificationTime = now;

      // Check if sound is enabled
      const soundEnabled = document.getElementById("soundEnabled").checked;

      // Play notification sound if enabled
      if (soundEnabled && notificationSound) {
        try {
          // Resume audio context if suspended (browser requirement)
          if (audioContext && audioContext.state === "suspended") {
            audioContext.resume();
          }
          notificationSound();
        } catch (error) {
          console.error("Failed to play notification sound:", error);
        }
      }

      // Show permanent visual notification
      document.body.classList.add("input-needed");

      // Update status bar
      updateStatus("connected", "⚠️ Waiting for input");

      // Update page title
      if (!originalPageTitle) {
        originalPageTitle = document.title;
      }
      document.title = "⚠️ Input needed - " + originalPageTitle;

      // Trigger file sync
      if (socket && containerId) {
        console.log("[SYNC] Triggering file sync due to input needed...");
        console.log("[SYNC] Container ID:", containerId);
        console.log("[SYNC] Socket connected:", socket.connected);
        console.log("[SYNC] Socket ID:", socket.id);

        // Test the socket connection first
        socket.emit("test-sync", { message: "testing sync connection" });

        // Emit the actual event and log it
        socket.emit("input-needed", { containerId });
        console.log("[SYNC] Event emitted successfully");

        // Set a timeout to check if we get a response
        setTimeout(() => {
          console.log("[SYNC] 5 seconds passed, checking if sync completed...");
        }, 5000);
      } else {
        console.log(
          "[SYNC] Cannot trigger sync - socket:",
          !!socket,
          "containerId:",
          !!containerId,
        );
      }
    }
  }
}

// Check if output contains loading characters
function checkForLoadingChars(text) {
  // Strip ANSI escape sequences to get plain text
  // This regex handles color codes, cursor movements, and other escape sequences
  const stripAnsi = (str) =>
    str.replace(
      /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      "",
    );
  const plainText = stripAnsi(text);

  let foundChars = [];
  // Check both the original text and stripped text
  const textsToCheck = [text, plainText];

  for (const textToCheck of textsToCheck) {
    for (const char of textToCheck) {
      if (LOADING_CHARS.includes(char)) {
        seenLoadingChars.add(char);
        foundChars.push(char);
      }
    }
  }

  if (foundChars.length > 0) {
    console.log(
      `[LOADING] Found loading chars: ${foundChars.join(", ")} | Total seen: ${Array.from(seenLoadingChars).join(", ")} (${seenLoadingChars.size}/${UNIQUE_LOADING_CHARS.size})`,
    );

    // Debug: show hex values if we're missing chars
    if (seenLoadingChars.size < UNIQUE_LOADING_CHARS.size && text.length < 50) {
      const hexView = Array.from(text)
        .map((c) => `${c}(${c.charCodeAt(0).toString(16)})`)
        .join(" ");
      console.log(`[LOADING] Hex view: ${hexView}`);
    }
  }

  // If we've seen all unique loading chars, we can stop waiting
  if (
    seenLoadingChars.size === UNIQUE_LOADING_CHARS.size &&
    isWaitingForLoadingAnimation
  ) {
    console.log(
      "[LOADING] ✓ Seen all loading characters, Claude has started processing",
    );
    isWaitingForLoadingAnimation = false;
    // Reset the idle timer now that we know Claude is processing
    resetIdleTimer();
  }
}

// Get container ID from URL only
const urlParams = new URLSearchParams(window.location.search);
containerId = urlParams.get("container");

// Initialize the terminal
function initTerminal() {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
      cursor: "#d4d4d4",
      black: "#000000",
      red: "#cd3131",
      green: "#0dbc79",
      yellow: "#e5e510",
      blue: "#2472c8",
      magenta: "#bc3fbc",
      cyan: "#11a8cd",
      white: "#e5e5e5",
      brightBlack: "#666666",
      brightRed: "#f14c4c",
      brightGreen: "#23d18b",
      brightYellow: "#f5f543",
      brightBlue: "#3b8eea",
      brightMagenta: "#d670d6",
      brightCyan: "#29b8db",
      brightWhite: "#e5e5e5",
    },
    allowProposedApi: true,
  });

  // Load addons
  fitAddon = new FitAddon.FitAddon();
  webLinksAddon = new WebLinksAddon.WebLinksAddon();

  term.loadAddon(fitAddon);
  term.loadAddon(webLinksAddon);

  // Open terminal in the DOM
  term.open(document.getElementById("terminal"));

  // Fit terminal to container
  fitAddon.fit();

  // Handle window resize
  window.addEventListener("resize", () => {
    fitAddon.fit();
    if (socket && socket.connected) {
      socket.emit("resize", {
        cols: term.cols,
        rows: term.rows,
      });
    }
  });

  // Handle terminal input
  term.onData((data) => {
    if (socket && socket.connected) {
      socket.emit("input", data);

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
        console.log(
          "[STATE] User provided input, waiting for loading animation...",
        );
        console.log(
          "[STATE] Need to see these chars:",
          Array.from(UNIQUE_LOADING_CHARS).join(", "),
        );

        // Clear the input-needed visual state
        document.body.classList.remove("input-needed");

        // Reset title
        if (originalPageTitle) {
          document.title = originalPageTitle;
        }

        // Update status
        updateStatus(
          "connected",
          `Connected to ${containerId.substring(0, 12)}`,
        );
      }
    }
  });

  // Show welcome message
  term.writeln("\x1b[1;32mWelcome to Claude Code Sandbox Terminal\x1b[0m");
  term.writeln("\x1b[90mConnecting to container...\x1b[0m");
  term.writeln("");

  // Auto-focus the terminal
  term.focus();
}

// Initialize Socket.IO connection
function initSocket() {
  socket = io();
  window.socket = socket; // Make it globally accessible for debugging

  socket.on("connect", () => {
    console.log("Connected to server");
    updateStatus("connecting", "Attaching to container...");

    // Hide loading spinner
    document.getElementById("loading").style.display = "none";

    // Only use container ID from URL, never from cache
    const urlParams = new URLSearchParams(window.location.search);
    const currentContainerId = urlParams.get("container");

    if (currentContainerId) {
      containerId = currentContainerId;
      socket.emit("attach", {
        containerId: currentContainerId,
        cols: term.cols,
        rows: term.rows,
      });
    } else {
      // No container ID in URL, fetch available containers
      fetchContainerList();
    }
  });

  socket.on("attached", (data) => {
    console.log("Attached to container:", data.containerId);
    containerId = data.containerId;
    updateStatus(
      "connected",
      `Connected to ${data.containerId.substring(0, 12)}`,
    );

    // Don't clear terminal on attach - preserve existing content

    // Send initial resize
    socket.emit("resize", {
      cols: term.cols,
      rows: term.rows,
    });

    // Start idle detection
    resetIdleTimer();

    // Focus terminal when attached
    if (term) {
      term.focus();
    }
  });

  socket.on("output", (data) => {
    // Convert ArrayBuffer to Uint8Array if needed
    if (data instanceof ArrayBuffer) {
      data = new Uint8Array(data);
    }
    term.write(data);

    // Convert to string to check for loading characters
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(data);

    // Check for loading characters if we're waiting for them
    if (isWaitingForLoadingAnimation) {
      checkForLoadingChars(text);
    } else if (text.length > 0) {
      // Check if loading chars are present in either raw or stripped text
      const stripAnsi = (str) =>
        str.replace(
          /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          "",
        );
      const plainText = stripAnsi(text);

      const foundInRaw = LOADING_CHARS.filter((char) => text.includes(char));
      const foundInPlain = LOADING_CHARS.filter((char) =>
        plainText.includes(char),
      );

      if (foundInRaw.length > 0 || foundInPlain.length > 0) {
        console.log("[DEBUG] Loading chars present but not tracking:", {
          raw: foundInRaw.join(", "),
          plain: foundInPlain.join(", "),
          hasAnsi: text !== plainText,
        });
      }
    }

    // Reset idle timer on any output
    resetIdleTimer();
  });

  socket.on("disconnect", () => {
    updateStatus("error", "Disconnected from server");
    term.writeln(
      '\r\n\x1b[1;31mServer connection lost. Click "Reconnect" to retry.\x1b[0m',
    );

    // Clear idle timer on disconnect
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    // Clear input-needed state
    document.body.classList.remove("input-needed");
    if (originalPageTitle) {
      document.title = originalPageTitle;
    }
  });

  socket.on("container-disconnected", () => {
    updateStatus("error", "Container disconnected");
    term.writeln(
      '\r\n\x1b[1;31mContainer connection lost. Click "Reconnect" to retry.\x1b[0m',
    );

    // Clear idle timer on disconnect
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    // Clear input-needed state
    document.body.classList.remove("input-needed");
    if (originalPageTitle) {
      document.title = originalPageTitle;
    }
  });

  socket.on("sync-complete", (data) => {
    console.log("[SYNC] Sync completed:", data);
    console.log("[SYNC] Has changes:", data.hasChanges);
    console.log("[SYNC] Summary:", data.summary);
    console.log("[SYNC] Diff data:", data.diffData);

    if (data.hasChanges) {
      // Keep showing container ID in status
      updateStatus("connected", `Connected to ${containerId.substring(0, 12)}`);
      updateChangesTab(data);

      // Update file count badge with total changed files
      const totalFiles = calculateTotalChangedFiles(data);
      updateChangesTabBadge(totalFiles);
    } else {
      updateStatus("connected", `Connected to ${containerId.substring(0, 12)}`);
      clearChangesTab();
      updateChangesTabBadge(0);
    }
  });

  socket.on("sync-error", (error) => {
    console.error("[SYNC] Sync error:", error);
    updateStatus("error", `Sync failed: ${error.message}`);
  });

  // Add general error handler
  socket.on("error", (error) => {
    console.error("[SOCKET] Socket error:", error);
  });

  // Add disconnect handler with debug
  socket.on("disconnect", (reason) => {
    console.log("[SOCKET] Disconnected:", reason);
  });

  // Container error handler (keeping this for backward compatibility)
  socket.on("container-error", (error) => {
    console.error("[CONTAINER] Container error:", error);
    updateStatus("error", "Error: " + error.message);
    if (term && term.writeln) {
      term.writeln("\r\n\x1b[1;31mError: " + error.message + "\x1b[0m");
    }

    // If container not found, try to get a new one
    if (error.message && error.message.includes("no such container")) {
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
    const response = await fetch("/api/containers");
    const containers = await response.json();

    if (containers.length > 0) {
      // Use the first container
      containerId = containers[0].Id;
      socket.emit("attach", {
        containerId,
        cols: term.cols,
        rows: term.rows,
      });
    } else {
      updateStatus("error", "No containers found");
      term.writeln("\x1b[1;31mNo Claude Code Sandbox containers found.\x1b[0m");
      term.writeln("\x1b[90mPlease start a container first.\x1b[0m");
    }
  } catch (error) {
    console.error("Failed to fetch containers:", error);
    updateStatus("error", "Failed to fetch containers");
  }
}

// Update connection status
function updateStatus(status, text) {
  const indicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");

  indicator.className = "status-indicator " + status;
  statusText.textContent = text;
}

// Control functions
function clearTerminal() {
  term.clear();
}

function reconnect() {
  if (socket && containerId) {
    // Don't clear terminal - preserve existing content
    term.writeln("\r\n\x1b[90mReconnecting...\x1b[0m");

    // Just emit attach again without disconnecting
    // This will reattach to the existing session
    socket.emit("attach", {
      containerId: containerId,
      cols: term.cols,
      rows: term.rows,
    });
  }
}

function copySelection() {
  const selection = term.getSelection();
  if (selection) {
    navigator.clipboard
      .writeText(selection)
      .then(() => {
        // Show temporary feedback
        const originalText = document.getElementById("status-text").textContent;
        updateStatus("connected", "Copied to clipboard");
        setTimeout(() => {
          updateStatus("connected", originalText);
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  }
}

// Initialize everything when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Store original page title
  originalPageTitle = document.title;

  initTerminal();
  initSocket();

  // Initialize audio on first user interaction (browser requirement)
  document.addEventListener(
    "click",
    function initAudioOnInteraction() {
      if (!audioContext) {
        initializeAudio();
      }
      // Remove listener after first interaction
      document.removeEventListener("click", initAudioOnInteraction);
    },
    { once: true },
  );

  // Also try to initialize on keyboard interaction
  document.addEventListener(
    "keydown",
    function initAudioOnKeyboard() {
      if (!audioContext) {
        initializeAudio();
      }
      // Remove listener after first interaction
      document.removeEventListener("keydown", initAudioOnKeyboard);
    },
    { once: true },
  );

  // Expose variables for testing with getters
  Object.defineProperty(window, "term", { get: () => term });
  Object.defineProperty(window, "isWaitingForInput", {
    get: () => isWaitingForInput,
  });
  Object.defineProperty(window, "isWaitingForLoadingAnimation", {
    get: () => isWaitingForLoadingAnimation,
  });
  Object.defineProperty(window, "seenLoadingChars", {
    get: () => seenLoadingChars,
  });
  Object.defineProperty(window, "lastOutputTime", {
    get: () => lastOutputTime,
  });
  Object.defineProperty(window, "lastNotificationTime", {
    get: () => lastNotificationTime,
  });
  Object.defineProperty(window, "audioContext", { get: () => audioContext });
  Object.defineProperty(window, "notificationSound", {
    get: () => notificationSound,
    set: (value) => {
      notificationSound = value;
    },
  });
});

// Calculate total changed files from sync data
function calculateTotalChangedFiles(syncData) {
  if (!syncData.diffData || !syncData.diffData.status) return 0;

  // Count unique files from git status
  const statusLines = syncData.diffData.status
    .split("\n")
    .filter((line) => line.trim());
  const uniqueFiles = new Set();

  statusLines.forEach((line) => {
    if (line.trim()) {
      const filename = line.substring(3).trim();
      if (filename) {
        uniqueFiles.add(filename);
      }
    }
  });

  return uniqueFiles.size;
}

// Update changes tab badge
function updateChangesTabBadge(fileCount) {
  const changesTab = document.getElementById("changes-tab");
  if (!changesTab) return;

  // Remove existing badge
  const existingBadge = changesTab.querySelector(".file-count-badge");
  if (existingBadge) {
    existingBadge.remove();
  }

  // Add new badge if there are changes
  if (fileCount > 0) {
    const badge = document.createElement("span");
    badge.className = "file-count-badge";
    badge.textContent = fileCount.toString();
    changesTab.appendChild(badge);
  }
}

// Tab system functions
function switchTab(tabName) {
  // Remove active class from all tabs and content
  document
    .querySelectorAll(".tab")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((content) => content.classList.remove("active"));

  // Add active class to selected tab and content
  document.getElementById(tabName + "-tab").classList.add("active");
  document.getElementById(tabName + "-content").classList.add("active");

  // Tab switching handled by active class now

  // Resize terminal if switching back to terminal tab
  if (tabName === "terminal" && term && term.fit) {
    setTimeout(() => term.fit(), 100);
  }
}

// Git workflow functions for tab system
function updateChangesTab(syncData) {
  console.log("[UI] updateChangesTab called with:", syncData);

  const container = document.getElementById("changes-container");

  if (!container) {
    console.error("[UI] changes-container not found!");
    return;
  }

  // Clear existing content
  container.innerHTML = "";

  // Create changes content
  const diffStats = syncData.diffData?.stats || {
    additions: 0,
    deletions: 0,
    files: 0,
  };
  const statsText =
    diffStats.files > 0
      ? `${diffStats.files} file(s), +${diffStats.additions} -${diffStats.deletions}`
      : "No changes";

  container.innerHTML = `
        <div class="changes-summary">
            <strong>Changes Summary:</strong> ${syncData.summary}
            <div class="diff-stats">📊 ${statsText}</div>
        </div>
        
        <div class="diff-viewer">
            ${formatDiffForDisplay(syncData.diffData)}
        </div>
        
        <div class="git-actions">
            <h3>💾 Commit Changes</h3>
            <textarea 
                id="commit-message" 
                placeholder="Enter commit message..."
                rows="3"
            >Update files from Claude

${syncData.summary}</textarea>
            
            <div style="margin-bottom: 15px;">
                <button onclick="commitChanges('${syncData.containerId}')" class="btn btn-primary" id="commit-btn">
                    Commit Changes
                </button>
            </div>
        </div>
        
        <div class="git-actions" id="push-section" style="display: none;">
            <h3>🚀 Push to Remote</h3>
            <div class="branch-input">
                <label for="branch-name">Branch name:</label>
                <input type="text" id="branch-name" placeholder="claude-changes" value="claude-changes">
            </div>
            <div>
                <button onclick="pushChanges('${syncData.containerId}')" class="btn btn-success" id="push-btn">
                    Push to Remote
                </button>
            </div>
        </div>
    `;

  // Store sync data for later use
  window.currentSyncData = syncData;
}

function clearChangesTab() {
  const container = document.getElementById("changes-container");
  const noChanges = document.getElementById("no-changes");

  // Show empty state
  noChanges.style.display = "block";

  // Clear changes content but keep the empty state
  container.innerHTML = `
        <div class="empty-state" id="no-changes">
            <h3>No changes detected</h3>
            <p>Claude hasn't made any changes yet. Changes will appear here automatically when Claude modifies files.</p>
        </div>
    `;

  // Remove badge
  updateChangesTabBadge(0);
}

function formatDiffForDisplay(diffData) {
  if (!diffData)
    return '<div class="diff-line context">No changes to display</div>';

  const lines = [];

  // Show file status
  if (diffData.status) {
    lines.push('<div class="diff-line header">📄 File Status:</div>');
    diffData.status.split("\n").forEach((line) => {
      if (line.trim()) {
        const status = line.substring(0, 2);
        const filename = line.substring(3);
        let statusText = "";
        if (status === "??") statusText = "New file";
        else if (status === " M" || status === "M " || status === "MM")
          statusText = "Modified";
        else if (status === " D" || status === "D ") statusText = "Deleted";
        else if (status === "A " || status === "AM") statusText = "Added";
        else statusText = `Status: ${status}`;

        lines.push(
          `<div class="diff-line context">  ${statusText}: ${filename}</div>`,
        );
      }
    });
    lines.push('<div class="diff-line context"></div>');
  }

  // Show diff
  if (diffData.diff) {
    lines.push('<div class="diff-line header">📝 Changes:</div>');
    diffData.diff.split("\n").forEach((line) => {
      let className = "context";
      if (line.startsWith("+")) className = "added";
      else if (line.startsWith("-")) className = "removed";
      else if (line.startsWith("@@")) className = "header";

      lines.push(
        `<div class="diff-line ${className}">${escapeHtml(line)}</div>`,
      );
    });
  }

  // Show untracked files
  if (diffData.untrackedFiles && diffData.untrackedFiles.length > 0) {
    lines.push('<div class="diff-line context"></div>');
    lines.push('<div class="diff-line header">📁 New Files:</div>');
    diffData.untrackedFiles.forEach((filename) => {
      lines.push(`<div class="diff-line added">+ ${filename}</div>`);
    });
  }

  return lines.join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function commitChanges(containerId) {
  const commitMessage = document.getElementById("commit-message").value.trim();
  if (!commitMessage) {
    alert("Please enter a commit message");
    return;
  }

  const btn = document.getElementById("commit-btn");
  btn.disabled = true;
  btn.textContent = "Committing...";

  socket.emit("commit-changes", { containerId, commitMessage });

  // Handle commit result
  socket.once("commit-success", () => {
    btn.textContent = "✓ Committed";
    btn.style.background = "#238636";

    // Show push section
    document.getElementById("push-section").style.display = "block";

    updateStatus("connected", "✓ Changes committed successfully");
  });

  socket.once("commit-error", (error) => {
    btn.disabled = false;
    btn.textContent = "Commit Changes";
    alert("Commit failed: " + error.message);
    updateStatus("error", "Commit failed: " + error.message);
  });
}

function pushChanges(containerId) {
  const branchName =
    document.getElementById("branch-name").value.trim() || "claude-changes";

  const btn = document.getElementById("push-btn");
  btn.disabled = true;
  btn.textContent = "Pushing...";

  socket.emit("push-changes", { containerId, branchName });

  // Handle push result
  socket.once("push-success", () => {
    btn.textContent = "✓ Pushed to GitHub";
    btn.style.background = "#238636";
    updateStatus("connected", `✓ Changes pushed to remote ${branchName}`);

    // Clear the changes tab after successful push
    setTimeout(() => {
      clearChangesTab();
    }, 3000);
  });

  socket.once("push-error", (error) => {
    btn.disabled = false;
    btn.textContent = "Push to Remote";
    alert("Push failed: " + error.message);
    updateStatus("error", "Push failed: " + error.message);
  });
}

// Handle keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl+Shift+C for copy
  if (e.ctrlKey && e.shiftKey && e.key === "C") {
    e.preventDefault();
    copySelection();
  }
  // Ctrl+Shift+V for paste
  else if (e.ctrlKey && e.shiftKey && e.key === "V") {
    e.preventDefault();
    navigator.clipboard.readText().then((text) => {
      if (socket && socket.connected) {
        socket.emit("input", text);
      }
    });
  }
});
