import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./index.css";

export default function App() {
  const socketRef = useRef(null);

  // UI / game state
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [hasName, setHasName] = useState(false);
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
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [finalResults, setFinalResults] = useState(null);

  // Canvas state
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);

  // Connect to backend
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
      setSessionTimeRemaining(0);
      setCountdown(0);
    });

    s.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
      setConnected(false);
    });

    s.on("chatMessage", (payload) => {
      setChat((c) => [...c, { from: payload.from, text: payload.text }]);
    });

    s.on("scoreUpdate", (payload) => {
      if (payload && payload.scores) setScores(payload.scores);
    });

    s.on("userList", (payload) => {
      if (Array.isArray(payload)) setUsers(payload);
    });

    s.on("countdown", (payload) => {
      setCountdown(payload.seconds);
      if (payload.seconds === 0) {
        setCountdown(0);
      }
    });

    s.on("gameState", (payload) => {
      setGameActive(payload.gameActive);
      setTimeRemaining(payload.timeRemaining || 0);
      setSessionTimeRemaining(payload.sessionTimeRemaining || 0);
      
      if (payload.currentDrawer) {
        setCurrentDrawerName(payload.currentDrawer);
        const amIDrawer = payload.currentDrawer === username;
        setIsDrawer(amIDrawer);
      } else {
        setCurrentDrawerName("");
        setIsDrawer(false);
      }
    });

    s.on("yourWord", (payload) => {
      setCurrentWord(payload.word);
      setIsDrawer(true);
    });

    s.on("remoteStroke", (stroke) => {
      drawStrokeOnCanvas(stroke);
    });

    s.on("clearBoard", () => {
      clearCanvasLocal();
    });

    s.on("sessionEnded", (payload) => {
      console.log("Session ended:", payload);
      setShowResults(true);
      setFinalResults(payload);
      setGameActive(false);
      setIsDrawer(false);
      setCurrentWord("");
      setCurrentDrawerName("");
    });

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    const s = socketRef.current;
    if (s && s.connected && hasName && username) {
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

  // Leave game
  const leaveGame = () => {
    if (window.confirm("Are you sure you want to leave the game?")) {
      const s = socketRef.current;
      if (s && s.connected) {
        s.emit("leaveGame");
      }
      // Reset state
      setHasName(false);
      setUsername("");
      setNameInput("");
      setShowResults(false);
      setFinalResults(null);
    }
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
    setUsername(name);
    localStorage.setItem("scribble_username", name);
    setHasName(true);
    setShowResults(false);
    setFinalResults(null);
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

  // Results Modal
  if (showResults && finalResults) {
    return (
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: darkMode ? "#1f2937" : "#ffffff",
          color: darkMode ? "#f9fafb" : "#111827",
          padding: "40px",
          borderRadius: "16px",
          maxWidth: "500px",
          width: "90%",
          textAlign: "center"
        }}>
          <h1 style={{ fontSize: "36px", marginBottom: "20px" }}> Game Over!</h1>
          
          {finalResults.winner && (
            <>
              <h2 style={{ fontSize: "28px", marginBottom: "30px", color: "#10b981" }}>
                Winner: {finalResults.winner}
              </h2>
              
              <div style={{ marginBottom: "30px" }}>
                <h3 style={{ fontSize: "20px", marginBottom: "15px" }}>Final Leaderboard:</h3>
                {finalResults.leaderboard.map(([name, score], index) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={name} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 20px",
                      marginBottom: "8px",
                      backgroundColor: darkMode ? "#374151" : "#f3f4f6",
                      borderRadius: "8px",
                      fontSize: "18px"
                    }}>
                      <span>{medals[index] || `${index + 1}.`} {name}</span>
                      <span style={{ fontWeight: 700 }}>{score} points</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          
          <button 
            onClick={() => {
              setShowResults(false);
              setFinalResults(null);
              setHasName(false);
              setUsername("");
              setNameInput("");
            }}
            style={{
              padding: "12px 30px",
              fontSize: "18px",
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="left-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>You:</div>
          <div style={{flex: 1 }}>{hasName ? username : "Not set"}</div>
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

        {/* Countdown Display */}
        {countdown > 0 && (
          <div style={{ 
            marginBottom: 12, 
            padding: 16, 
            borderRadius: 8,
            backgroundColor: "#fef3c7",
            color: "#92400e",
            fontSize: 20,
            textAlign: "center",
            fontWeight: 700,
            fontFamily: "monospace"
          }}>
              Starting in {countdown}s...
          </div>
        )}

        {/* Leave Button */}
        {hasName && (
          <button 
            className="button" 
            onClick={leaveGame}
            style={{
              width: "100%",
              marginBottom: 12,
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontWeight: 600
            }}
          >
              Leave Game
          </button>
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
            {isDrawer ? ` You're drawing: ${currentWord}` : ` ${currentDrawerName} is drawing`}
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
            </div>
          )}
        </div>
      </div>

      <div className="right-panel">
        {/* Timer Bar at Top */}
        {gameActive && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            backgroundColor: darkMode ? "#1f2937" : "#ffffff",
            borderBottom: `2px solid ${darkMode ? "#374151" : "#e5e7eb"}`
          }}>
            {/* Round Timer */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: darkMode ? "#d1d5db" : "#6b7280" }}>
                Round Time:
              </div>
              <div style={{
                padding: "8px 16px",
                borderRadius: 8,
                backgroundColor: timeRemaining < 30 ? "#fef3c7" : "#dbeafe",
                color: timeRemaining < 30 ? "#92400e" : "#1e40af",
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "monospace",
                minWidth: 80,
                textAlign: "center"
              }}>
                ⏱️ {formatTime(timeRemaining)}
              </div>
            </div>

            {/* Session Timer */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: darkMode ? "#d1d5db" : "#6b7280" }}>
                Session Time:
              </div>
              <div style={{
                padding: "8px 16px",
                borderRadius: 8,
                backgroundColor: sessionTimeRemaining < 120 ? "#fee2e2" : "#d1fae5",
                color: sessionTimeRemaining < 120 ? "#991b1b" : "#065f46",
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "monospace",
                minWidth: 80,
                textAlign: "center"
              }}>
                🎮 {formatTime(sessionTimeRemaining)}
              </div>
            </div>
          </div>
        )}

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
