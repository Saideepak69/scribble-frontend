import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./index.css";

export default function App() {
  const socketRef = useRef(null);

  // UI / game state
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState("");  // CHANGED: Start empty
  const [nameInput, setNameInput] = useState("");
  const [hasName, setHasName] = useState(false);  // CHANGED: Start false
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("scribble_dark") === "1");
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState("");
  const [scores, setScores] = useState({});
  const [users, setUsers] = useState([]);
  
  // Game state
  const [isDrawer, setIsDrawer] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [currentDrawerName, setCurrentDrawerName] = useState("");
  const [gameActive, setGameActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Canvas state
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);

  // Connect to backend socket.io
  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    
    console.log("🔌 Connecting to backend:", BACKEND_URL);
    
    const s = io(BACKEND_URL, { 
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    
    socketRef.current = s;

    s.on("connect", () => {
      console.log("✅ Connected to server");
      setConnected(true);
      if (hasName && username) {
        console.log("📤 Sending join event for:", username);
        s.emit("join", username);
      }
    });

    s.on("disconnect", () => {
      console.log("❌ Disconnected from server");
      setConnected(false);
      setIsDrawer(false);
      setCurrentWord("");
      setCurrentDrawerName("");
      setGameActive(false);
      setTimeRemaining(0);
    });

    s.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
      setConnected(false);
    });

    s.on("chatMessage", (payload) => {
      console.log("💬 Received chat message:", payload);
      setChat((c) => [...c, { from: payload.from, text: payload.text }]);
    });

    s.on("scoreUpdate", (payload) => {
      console.log("🏆 Received score update:", payload);
      if (payload && payload.scores) setScores(payload.scores);
    });

    s.on("userList", (payload) => {
      console.log("👥 Received user list:", payload);
      if (Array.isArray(payload)) setUsers(payload);
    });

    s.on("gameState", (payload) => {
      console.log("🎮 Received game state:", payload);
      setGameActive(payload.gameActive);
      setTimeRemaining(payload.timeRemaining || 0);
      
      if (payload.currentDrawer) {
        setCurrentDrawerName(payload.currentDrawer);
        const amIDrawer = payload.currentDrawer === username;
        setIsDrawer(amIDrawer);
        console.log("   Am I drawer?", amIDrawer);
      } else {
        setCurrentDrawerName("");
        setIsDrawer(false);
      }
    });

    s.on("yourWord", (payload) => {
      console.log("🎨 Received word to draw:", payload.word);
      setCurrentWord(payload.word);
      setIsDrawer(true);
    });

    s.on("remoteStroke", (stroke) => {
      drawStrokeOnCanvas(stroke);
    });

    s.on("clearBoard", () => {
      console.log("🗑️  Received clear board command");
      clearCanvasLocal();
    });

    return () => {
      console.log("🔌 Disconnecting socket...");
      s.disconnect();
    };
  }, []);

  // Separate effect for username changes
  useEffect(() => {
    const s = socketRef.current;
    if (s && s.connected && hasName && username) {
      console.log("📤 Sending join event for:", username);
      s.emit("join", username);
    }
  }, [hasName, username]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;

      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tmpCtx = tmp.getContext("2d");
      if (tmpCtx) tmpCtx.drawImage(canvas, 0, 0);

      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));

      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tmp, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // Auto-scroll chat
  const chatBoxRef = useRef(null);
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chat]);

  // Draw helper
  const drawStrokeOnCanvas = (stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.save();

    if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color || "#000000";
    }

    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.from.x, stroke.from.y);
    ctx.lineTo(stroke.to.x, stroke.to.y);
    ctx.stroke();

    ctx.restore();
  };

  const clearCanvasLocal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const sendStrokeToServer = (stroke) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit("stroke", stroke);
  };

  const toCanvasPoint = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { 
      x: clientX - rect.left, 
      y: clientY - rect.top 
    };
  };

  // Pointer handlers
  const handlePointerDown = (e) => {
    if (!isDrawer) return;
    
    e.preventDefault();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const p = toCanvasPoint(clientX, clientY);
    drawingRef.current = true;
    lastPointRef.current = p;
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current || !isDrawer) return;
    
    e.preventDefault();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const to = toCanvasPoint(clientX, clientY);
    const from = lastPointRef.current || to;

    const stroke = {
      from,
      to,
      color: tool === "eraser" ? "#ffffff" : color,
      size: tool === "eraser" ? Math.max(8, size * 1.8) : size,
      tool,
    };

    drawStrokeOnCanvas(stroke);
    sendStrokeToServer(stroke);

    lastPointRef.current = to;
  };

  const handlePointerUp = (e) => {
    if (e) e.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  // Game controls
  const startGame = () => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      alert("Not connected to server!");
      return;
    }
    console.log("📤 Sending start game command");
    s.emit("startGame");
  };

  const stopGame = () => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      alert("Not connected to server!");
      return;
    }
    console.log("📤 Sending stop game command");
    s.emit("stopGame");
  };

  // Chat
  const sendChat = (e) => {
    e?.preventDefault();
    if (!msg.trim()) return;
    if (!hasName) {
      alert("Set username first.");
      return;
    }
    const s = socketRef.current;
    if (!s || !s.connected) {
      alert("Not connected to server!");
      return;
    }
    s.emit("guess", { from: username, text: msg });
    setMsg("");
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(e);
    }
  };

  // Set username
  const confirmName = (e) => {
    e?.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      alert("Please enter a username");
      return;
    }
    console.log("Setting username:", name);
    setUsername(name);
    localStorage.setItem("scribble_username", name);  // Save for convenience
    setHasName(true);
  };

  const handleNameKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmName(e);
    }
  };

  // Clear board
  const clearBoard = () => {
    if (!isDrawer) return;
    const s = socketRef.current;
    clearCanvasLocal();
    if (s && s.connected) s.emit("clear");
  };

  // Dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("scribble_dark", "1");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("scribble_dark", "0");
    }
  }, [darkMode]);

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const topScorers = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="container">
      <div className="left-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>You:</div>
          <div style={{ flex: 1 }}>{hasName ? username : "Not set"}</div>
          <button className="button" onClick={() => setDarkMode((s) => !s)}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>

        {/* Connection Status */}
        <div style={{ 
          marginBottom: 12, 
          padding: 8, 
          borderRadius: 6,
          backgroundColor: connected ? "#d1fae5" : "#fee2e2",
          color: connected ? "#065f46" : "#991b1b",
          fontSize: 13,
          textAlign: "center",
          fontWeight: 600
        }}>
          {connected ? "🟢 Connected" : "🔴 Disconnected"}
        </div>

        {/* Game Controls */}
        {hasName && connected && (
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            <button 
              className="button" 
              onClick={startGame}
              disabled={gameActive}
              style={{ 
                flex: 1,
                backgroundColor: gameActive ? "#9ca3af" : "#10b981",
                color: "#ffffff",
                fontWeight: 600
              }}
            >
              🎮 Start Game
            </button>
            <button 
              className="button" 
              onClick={stopGame}
              disabled={!gameActive}
              style={{ 
                flex: 1,
                backgroundColor: !gameActive ? "#9ca3af" : "#ef4444",
                color: "#ffffff",
                fontWeight: 600
              }}
            >
              🛑 Stop Game
            </button>
          </div>
        )}

        {/* Timer Display */}
        {gameActive && (
          <div style={{ 
            marginBottom: 12, 
            padding: 12, 
            borderRadius: 6,
            backgroundColor: timeRemaining < 10 ? "#fef3c7" : "#dbeafe",
            color: timeRemaining < 10 ? "#92400e" : "#1e40af",
            fontSize: 24,
            textAlign: "center",
            fontWeight: 700,
            fontFamily: "monospace"
          }}>
            ⏱️ {formatTime(timeRemaining)}
          </div>
        )}

        {/* Current Drawer Info */}
        {currentDrawerName && (
          <div style={{ 
            marginBottom: 12, 
            padding: 8, 
            borderRadius: 6,
            backgroundColor: isDrawer ? "#dbeafe" : "#fef3c7",
            color: isDrawer ? "#1e40af" : "#92400e",
            fontSize: 13,
            textAlign: "center",
            fontWeight: 600
          }}>
            {isDrawer ? `🎨 You're drawing: ${currentWord}` : `👀 ${currentDrawerName} is drawing`}
          </div>
        )}

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Scoreboard</div>
          <div className="scoreboard">
            {Object.keys(scores).length === 0 ? (
              <div style={{ color: "#6b7280" }}>No scores yet</div>
            ) : (
              <>
                {topScorers.map(([u, p]) => (
                  <div key={u} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>{u}</div>
                    <div style={{ fontWeight: 700 }}>{p}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Chat</div>
          <div className="chat-box" ref={chatBoxRef}>
            {chat.map((c, i) => (
              <div key={i} className="chat-message">
                <strong>{c.from}:</strong> {c.text}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input 
              className="input" 
              placeholder={hasName ? "Type a guess..." : "Set username to chat"} 
              value={msg} 
              onChange={(e) => setMsg(e.target.value)} 
              onKeyPress={handleChatKeyPress}
              disabled={!hasName || !connected} 
            />
            <button 
              className="button" 
              onClick={sendChat} 
              disabled={!hasName || !connected}
            >
              Send
            </button>
          </div>

          {!hasName && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input 
                className="input" 
                placeholder="Enter username" 
                value={nameInput} 
                onChange={(e) => setNameInput(e.target.value)} 
                onKeyPress={handleNameKeyPress}
              />
              <button className="button" onClick={confirmName}>
                Set
              </button>
            </div>)}
        </div>
      </div>

      <div className="right-panel">
        <div className="toolbar">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button 
              className="button" 
              onClick={() => setTool("pen")} 
              disabled={!isDrawer}
              style={{ 
                border: tool === "pen" ? "2px solid #0b74ff" : undefined,
                opacity: isDrawer ? 1 : 0.5
              }}
            >
              ✏️ Pen
            </button>
            <button 
              className="button" 
              onClick={() => setTool("eraser")} 
              disabled={!isDrawer}
              style={{ 
                border: tool === "eraser" ? "2px solid #0b74ff" : undefined,
                opacity: isDrawer ? 1 : 0.5
              }}
            >
              🧹 Eraser
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input 
              type="color" 
              value={color} 
              onChange={(e) => setColor(e.target.value)} 
              className="input" 
              style={{ padding: 3, height: 36, width: 48 }} 
              disabled={tool === "eraser" || !isDrawer} 
            />
            <input 
              type="range" 
              min={1} 
              max={60} 
              value={size} 
              onChange={(e) => setSize(Number(e.target.value))}
              disabled={!isDrawer}
            />
            <div style={{ minWidth: 60 }}>Size: {size}</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button 
              className="button" 
              onClick={clearBoard}
              disabled={!isDrawer}
              style={{ opacity: isDrawer ? 1 : 0.5 }}
            >
              🗑️ Clear
            </button>
            <button 
              className="button" 
              onClick={() => {
                const c = canvasRef.current;
                if (!c) return;
                const url = c.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = url;
                a.download = "drawing.png";
                a.click();
              }}
            >
              💾 Export
            </button>
          </div>
        </div>

        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            className="canvas-element"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{ cursor: isDrawer ? (tool === "pen" ? "crosshair" : "cell") : "not-allowed" }}
          />
        </div>
      </div>
    </div>
  );
}