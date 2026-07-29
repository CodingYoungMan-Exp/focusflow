import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, SkipForward, Timer, BarChart3, Settings as SettingsIcon, Zap, Minus, Plus, Check, Trash2, ListChecks } from "lucide-react";

const DEFAULTS = { focusMin: 60, breakMin: 15, dailyGoalMin: 180 };

const SETTINGS_KEY = "focusflow:settings";
const SESSIONS_KEY = "focusflow:sessions";
const TODOS_KEY = "focusflow:todos";
const THEME_KEY = "focusflow:theme";

const themeOptions = [
  { id: "midnight", name: "🌌 Midnight" },
  { id: "forest", name: "🌿 Forest" },
  { id: "ocean", name: "🌊 Ocean" },
  { id: "sunset", name: "🌅 Sunset" },
  { id: "sakura", name: "🌸 Sakura" },
  { id: "coffee", name: "☕ Coffee" },
  { id: "cyberpunk", name: "🚀 Cyberpunk" },
  { id: "frost", name: "❄️ Frost" },
  { id: "amoled", name: "🌙 AMOLED" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtHM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

const DAY_MS = 86400000;

function computeStreaks(sessions) {
  const daySet = new Set(sessions.map((s) => startOfDay(new Date(s.completedAt)).getTime()));
  let cursor = startOfDay(new Date()).getTime();
  if (!daySet.has(cursor)) cursor -= DAY_MS; // grace: don't break streak just because today has no session yet
  let current = 0;
  while (daySet.has(cursor)) {
    current += 1;
    cursor -= DAY_MS;
  }
  const sortedDays = Array.from(daySet).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of sortedDays) {
    if (prev !== null && day - prev === DAY_MS) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest };
}

export default function FocusFlow() {
  const [tab, setTab] = useState("focus");
  const [mode, setMode] = useState("focus");
  const [settings, setSettings] = useState(DEFAULTS);
  const [sessions, setSessions] = useState([]);
  const [todos, setTodos] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULTS.focusMin * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState("");
  const [theme, setTheme] = useState("midnight");
  const intervalRef = useRef(null);

  useEffect(() => {
    (async () => {
      let loadedSettings = DEFAULTS;
      let loadedSessions = [];
      let loadedTodos = [];
      let loadedTheme = "midnight";
      try {
        const s = await window.storage.get(SETTINGS_KEY);
        if (s?.value) loadedSettings = { ...DEFAULTS, ...JSON.parse(s.value) };
      } catch (e) {}
      try {
        const s = await window.storage.get(SESSIONS_KEY);
        if (s?.value) loadedSessions = JSON.parse(s.value);
      } catch (e) {}
      try {
        const t = await window.storage.get(TODOS_KEY);
        if (t?.value) loadedTodos = JSON.parse(t.value);
      } catch (e) {}
      try {
        const th = await window.storage.get(THEME_KEY);
        if (th?.value) loadedTheme = th.value;
      } catch (e) {}
      setSettings(loadedSettings);
      setSessions(loadedSessions);
      setTodos(loadedTodos);
      setTheme(loadedTheme);
      setSecondsLeft(loadedSettings.focusMin * 60);
      setLoaded(true);
    })();
  }, []);

  const persistSettings = useCallback(async (next) => {
    try { await window.storage.set(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
  }, []);
  const persistSessions = useCallback(async (next) => {
    try { await window.storage.set(SESSIONS_KEY, JSON.stringify(next)); } catch (e) {}
  }, []);
  const persistTodos = useCallback(async (next) => {
    try { await window.storage.set(TODOS_KEY, JSON.stringify(next)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (!isRunning) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          handleComplete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
}, [theme]);

  useEffect(() => {
  const saveTheme = async () => {
    try {
      await window.storage.set(THEME_KEY, theme);
    } catch {}
  };

  saveTheme();
}, [theme]);

  function totalSecondsFor(m) {
    return (m === "focus" ? settings.focusMin : settings.breakMin) * 60;
  }

  function handleComplete() {
    setIsRunning(false);
    if (mode === "focus") {
      const entry = {
        id: Date.now(),
        minutes: settings.focusMin,
        completedAt: Date.now(),
        completed: true,
        label: label.trim() || null,
      };
      setSessions((prev) => {
        const next = [entry, ...prev];
        persistSessions(next);
        return next;
      });
      switchMode("break");
    } else {
      switchMode("focus");
    }
  }

  function switchMode(next) {
    setMode(next);
    setIsRunning(false);
    setSecondsLeft(totalSecondsFor(next));
  }

  function handlePlayPause() {
    setIsRunning((r) => !r);
  }

  function handleReset() {
    setIsRunning(false);
    setSecondsLeft(totalSecondsFor(mode));
  }

  function handleSkip() {
    setIsRunning(false);
    if (mode === "focus" && secondsLeft < totalSecondsFor("focus")) {
      const minutesDone = Math.max(1, Math.round((totalSecondsFor("focus") - secondsLeft) / 60));
      const entry = { id: Date.now(), minutes: minutesDone, completedAt: Date.now(), completed: true, label: label.trim() || null };
      setSessions((prev) => {
        const next = [entry, ...prev];
        persistSessions(next);
        return next;
      });
    }
    switchMode(mode === "focus" ? "break" : "focus");
  }

  function updateSetting(key, delta, min, max) {
    setSettings((prev) => {
      const val = Math.min(max, Math.max(min, prev[key] + delta));
      const next = { ...prev, [key]: val };
      persistSettings(next);
      if ((key === "focusMin" && mode === "focus") || (key === "breakMin" && mode === "break")) {
        if (!isRunning) setSecondsLeft(val * 60);
      }
      return next;
    });
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry = { id: Date.now(), text: trimmed, done: false };
    setTodos((prev) => {
      const next = [entry, ...prev];
      persistTodos(next);
      return next;
    });
  }
  function toggleTodo(id) {
    setTodos((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      persistTodos(next);
      return next;
    });
  }
  function deleteTodo(id) {
    setTodos((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persistTodos(next);
      return next;
    });
  }

  const today = startOfDay(new Date());
  const todaySessions = sessions.filter((s) => startOfDay(new Date(s.completedAt)).getTime() === today.getTime());
  const todayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);
  const allTimeMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, settings.dailyGoalMin)) * 100));
  const { current: streak, longest: longestStreak } = computeStreaks(sessions);

  const recentLabels = Array.from(
    new Set(sessions.filter((s) => s.label).map((s) => s.label))
  ).slice(0, 5);

  const total = totalSecondsFor(mode);
  const progress = total > 0 ? (total - secondsLeft) / total : 0;
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const gradId = mode === "focus" ? "focusGrad" : "breakGrad";

  if (!loaded) {
    return (
      <div style={{ background: "var(--bg)", minHeight: "100vh" }} className="flex items-center justify-center">
        <div style={{ color: "var(--muted)" }}>Loadingâ¦</div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }} className="flex justify-center">
      <div style={{ width: "100%", maxWidth: 430 }} className="flex flex-col min-h-screen">
        <div className="flex-1 px-6 pt-8 pb-4 overflow-y-auto">
          {tab === "focus" && (
            <FocusTab
              mode={mode}
              setModeManually={(m) => { if (!isRunning) switchMode(m); }}
              secondsLeft={secondsLeft}
              radius={radius}
              circumference={circumference}
              dashOffset={dashOffset}
              gradId={gradId}
              isRunning={isRunning}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onSkip={handleSkip}
              streak={streak}
              goalPct={goalPct}
              todayMinutes={todayMinutes}
              dailyGoalMin={settings.dailyGoalMin}
              label={label}
              setLabel={setLabel}
              recentLabels={recentLabels}
            />
          )}
          {tab === "stats" && (
            <StatsTab
              todayMinutes={todayMinutes}
              sessionCount={todaySessions.length}
              streak={streak}
              longestStreak={longestStreak}
              allTimeMinutes={allTimeMinutes}
              dailyGoalMin={settings.dailyGoalMin}
              sessions={sessions}
              todos={todos}
              addTodo={addTodo}
              toggleTodo={toggleTodo}
              deleteTodo={deleteTodo}
            />
          )}
          {tab === "settings" && (
            <SettingsTab settings={settings} updateSetting={updateSetting} theme = {theme} setTheme={setTheme}/>
          )}
        </div>

        <BottomNav tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: "focus", label: "Focus", Icon: Timer },
    { id: "stats", label: "Stats", Icon: BarChart3 },
    { id: "settings", label: "Settings", Icon: SettingsIcon },
  ];
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }} className="flex justify-around py-3">
      {items.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex flex-col items-center gap-1 px-4"
            style={{ color: active ? "#818cf8" : "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            <Icon size={22} strokeWidth={2} />
            <span style={{ fontSize: 13 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FocusTab({ mode, setModeManually, secondsLeft, radius, circumference, dashOffset, gradId, isRunning, onPlayPause, onReset, onSkip, streak, goalPct, todayMinutes, dailyGoalMin, label, setLabel, recentLabels }) {
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const accent = mode === "focus" ? "#818cf8" : "#22d3ee";

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 style={{ color: "var(--text)", fontSize: 34, fontWeight: 700, margin: 0 }}>FocusFlow</h1>
          <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 4 }}>Stay focused, reduce distractions</p>
        </div>
        <div style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 999, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <Zap size={14} color="#fbbf24" fill="#fbbf24" />
          <span style={{ color: "#fbbf24", fontSize: 14, fontWeight: 600 }}>{streak} day{streak === 1 ? "" : "s"}</span>
        </div>
      </div>

      {mode === "focus" && (
        <div className="mt-5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What are you focusing on?"
            style={{
              width: "100%", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 14,
              padding: "12px 16px", color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box",
            }}
          />
          {recentLabels.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {recentLabels.map((l) => (
                <button
                  key={l}
                  onClick={() => setLabel(l)}
                  style={{
                    background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 999,
                    padding: "6px 12px", color: "#94a3b8", fontSize: 13, cursor: "pointer",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-5">
        <button
          onClick={() => setModeManually("focus")}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 999, border: "none", cursor: "pointer",
            background: mode === "focus" ? "linear-gradient(90deg,#8b7cf6,#6366f1)" : "var(--secondary)",
            color: mode === "focus" ? "#fff" : "#94a3b8", fontSize: 16, fontWeight: 600,
          }}
        >
          Focus
        </button>
        <button
          onClick={() => setModeManually("break")}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 999, border: "none", cursor: "pointer",
            background: mode === "break" ? "linear-gradient(90deg,#22d3ee,#0ea5e9)" : "var(--secondary)",
            color: mode === "break" ? "#fff" : "#94a3b8", fontSize: 16, fontWeight: 600,
          }}
        >
          Break
        </button>
      </div>

      <div className="flex justify-center my-8">
        <svg width="290" height="290" viewBox="0 0 290 290">
          <defs>
            <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#8b7cf6" />
            </linearGradient>
            <linearGradient id="breakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <circle cx="145" cy="145" r={radius} fill="none" stroke="var(--border)" strokeWidth="14" />
          <circle
            cx="145" cy="145" r={radius} fill="none"
            stroke={`url(#${gradId})`} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            transform="rotate(-90 145 145)"
            style={{ transition: "stroke-dashoffset 0.3s linear" }}
          />
          <text x="145" y="122" textAnchor="middle" fill="var(--muted)" fontSize="15" letterSpacing="3" style={{ textTransform: "uppercase" }}>
            {mode === "focus" ? "Focus" : "Short Break"}
          </text>
          <text x="145" y="166" textAnchor="middle" fill="var(--text)" fontSize="52" fontWeight="600">
            {pad(mins)}:{pad(secs)}
          </text>
          {mode === "focus" && label && (
            <text x="145" y="196" textAnchor="middle" fill="#818cf8" fontSize="14">
              {label.length > 24 ? label.slice(0, 24) + "â¦" : label}
            </text>
          )}
        </svg>
      </div>

      <div className="flex justify-center items-center gap-8 mb-8">
        <button onClick={onReset} style={circleBtnStyle("var(--secondary)")}>
          <RotateCcw size={20} color="#94a3b8" />
        </button>
        <button onClick={onPlayPause} style={circleBtnStyle(accent, 74)}>
          {isRunning ? <Pause size={28} color="#fff" fill="#fff" /> : <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
        </button>
        <button onClick={onSkip} style={circleBtnStyle("var(--secondary)")}>
          <SkipForward size={20} color="#94a3b8" />
        </button>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: 22 }}>
        <div className="flex justify-between items-center mb-3">
          <span style={{ color: "var(--muted)", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>DAILY GOAL</span>
          <span style={{ color: "#818cf8", fontSize: 15, fontWeight: 700 }}>{goalPct}%</span>
        </div>
        <div style={{ height: 8, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${goalPct}%`, background: "linear-gradient(90deg,#8b7cf6,#38bdf8)", borderRadius: 999, transition: "width 0.3s" }} />
        </div>
        <div style={{ marginTop: 12, color: "var(--text)", fontSize: 20, fontWeight: 700 }}>
          {fmtHM(todayMinutes)} <span style={{ color: "#64748b", fontSize: 15, fontWeight: 400 }}>of {fmtHM(dailyGoalMin)} goal</span>
        </div>
      </div>
    </div>
  );
}

function circleBtnStyle(bg, size = 58) {
  return {
    width: size, height: size, borderRadius: "50%", background: bg, border: "none",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };
}

function StatsTab({ todayMinutes, sessionCount, streak, longestStreak, allTimeMinutes, dailyGoalMin, sessions, todos, addTodo, toggleTodo, deleteTodo }) {
  const [view, setView] = useState("week");
  const [taskInput, setTaskInput] = useState("");

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = startOfDay(d).getTime();
    const mins = sessions
      .filter((s) => startOfDay(new Date(s.completedAt)).getTime() === key)
      .reduce((a, s) => a + s.minutes, 0);
    last7.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), mins, isToday: i === 0 });
  }
  const maxBar = Math.max(60, ...last7.map((d) => d.mins));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthSessions = sessions.filter((s) => {
    const d = new Date(s.completedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const monthMinutes = monthSessions.reduce((a, s) => a + s.minutes, 0);
  const monthDaysActive = new Set(monthSessions.map((s) => startOfDay(new Date(s.completedAt)).getTime())).size;
  const dayMinsMap = {};
  monthSessions.forEach((s) => {
    const day = new Date(s.completedAt).getDate();
    dayMinsMap[day] = (dayMinsMap[day] || 0) + s.minutes;
  });
  const monthCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const pendingCount = todos.filter((t) => !t.done).length;

  return (
    <div>
      <h1 style={{ color: "var(--text)", fontSize: 34, fontWeight: 700, margin: "0 0 20px" }}>Stats</h1>

      <div className="flex gap-3 mb-5">
        <StatCard icon={<Timer size={20} color="#818cf8" />} value={fmtHM(todayMinutes)} label="Today" />
        <StatCard icon={<Check size={20} color="#22d3ee" />} value={sessionCount} label="Sessions" />
        <StatCard icon={<Zap size={20} color="#fbbf24" fill="#fbbf24" />} value={streak} label="Streak" />
      </div>

      <div style={{ background: "#111726", border: "1px solid var(--border)", borderRadius: 20, padding: 22, marginBottom: 20 }}>
        <div className="flex justify-between mb-2">
          <span style={{ color: "var(--muted)", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>ALL-TIME FOCUS</span>
          <span style={{ color: "var(--muted)", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>LONGEST STREAK</span>
        </div>
        <div className="flex justify-between items-end">
          <span style={{ color: "var(--text)", fontSize: 30, fontWeight: 700 }}>{fmtHM(allTimeMinutes)}</span>
          <span style={{ color: "#818cf8", fontSize: 18, fontWeight: 600 }}>{longestStreak} day{longestStreak === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: 22, marginBottom: 20 }}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ color: "#var(--text)", fontSize: 20, fontWeight: 700, margin: 0 }}>{view === "week" ? "This Week" : "This Month"}</h3>
          <div className="flex gap-1" style={{ background: "var(--bg)", borderRadius: 999, padding: 3 }}>
            {["week", "month"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  border: "none", borderRadius: 999, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: view === v ? "#6366f1" : "transparent",
                  color: view === v ? "#fff" : "var(--muted)",
                }}
              >
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>

        {view === "week" ? (
          <div className="flex items-end justify-between" style={{ height: 130 }}>
            {last7.map((d, i) => (
              <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
                {d.isToday && d.mins > 0 && <span style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{d.mins}m</span>}
                <div
                  style={{
                    width: "70%", maxWidth: 34,
                    height: Math.max(6, (d.mins / maxBar) * 100),
                    background: d.isToday ? "linear-gradient(180deg,#8b7cf6,#6366f1)" : "var(--border)",
                    borderRadius: 6,
                  }}
                />
                <span style={{ color: d.isToday ? "#818cf8" : "var(--muted)", fontSize: 13, marginTop: 8 }}>{d.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex justify-between mb-4">
              <div>
                <div style={{ color: "var(--text)", fontSize: 24, fontWeight: 700 }}>{fmtHM(monthMinutes)}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>this month</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "var(--text)", fontSize: 24, fontWeight: 700 }}>{monthDaysActive}/{daysInMonth}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>active days</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {monthCells.map((day) => {
                const mins = dayMinsMap[day] || 0;
                const ratio = Math.min(1, mins / Math.max(1, 60));
                const bg = mins === 0 ? "var(--border)" : `rgba(139,124,246,${0.25 + ratio * 0.75})`;
                const isToday = day === now.getDate();
                return (
                  <div
                    key={day}
                    style={{
                      aspectRatio: "1", borderRadius: 6, background: bg,
                      border: isToday ? "1.5px solid #818cf8" : "1px solid transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: mins > 0 ? "#var(--text)" : "#475569", fontSize: 10,
                    }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: 22, marginBottom: 20 }}>
        <h3 style={{ color: "var(--text)", fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>Recent Sessions</h3>
        {sessions.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No sessions yet, finish a focus timer to see it here.</p>}
        {sessions.slice(0, 8).map((s) => (
          <div key={s.id} className="flex items-center justify-between" style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
              <div>
                <div style={{ color: "var(--text)", fontSize: 16, fontWeight: 600 }}>
                  {fmtHM(s.minutes)}{s.label ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> Â· {s.label}</span> : null}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {new Date(s.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </div>
            <Check size={18} color="#34d399" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: 22 }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListChecks size={20} color="#818cf8" />
            <h3 style={{ color: "var(--text)", fontSize: 20, fontWeight: 700, margin: 0 }}>Tasks</h3>
          </div>
          {pendingCount > 0 && <span style={{ color: "var(--muted)", fontSize: 13 }}>{pendingCount} pending</span>}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addTodo(taskInput);
                setTaskInput("");
              }
            }}
            placeholder="Add a taskâ¦"
            style={{
              flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
              padding: "10px 14px", color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            onClick={() => { addTodo(taskInput); setTaskInput(""); }}
            style={{ background: "#6366f1", border: "none", borderRadius: 12, padding: "0 18px", color: "#fff", fontSize: 20, fontWeight: 600, cursor: "pointer" }}
          >
            +
          </button>
        </div>

        {todos.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No tasks yet, add something you're working on.</p>}
        {todos.map((t) => (
          <div key={t.id} className="flex items-center justify-between" style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3" style={{ minWidth: 0 }} onClick={() => toggleTodo(t.id)}>
              <div
                style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
                  border: t.done ? "none" : "1.5px solid #475569",
                  background: t.done ? "#34d399" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {t.done && <Check size={14} color="#0a0e1a" />}
              </div>
              <span
                style={{
                  color: t.done ? "var(--muted)" : "var(--text)", fontSize: 15,
                  textDecoration: t.done ? "line-through" : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer",
                }}
              >
                {t.text}
              </span>
            </div>
            <button onClick={() => deleteTodo(t.id)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 4 }}>
              <Trash2 size={16} color="var(--muted)" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {icon}
      <span style={{ color: "var(--text)", fontSize: 24, fontWeight: 700 }}>{value}</span>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{label}</span>
    </div>
  );
}

function SettingsTab({ settings, updateSetting, theme, setTheme }) {
  return (
    <div>
      <h1 style={{ color: "var(--text)", fontSize: 34, fontWeight: 700, margin: 0 }}>Settings</h1>
      <p style={{ color: "var(--muted)", fontSize: 15, margin: "4px 0 24px" }}>Customize your focus sessions</p>

      <SettingsGroup title="TIMER DURATIONS">
        <SettingsRow
          title="Focus" subtitle="Work session length" unit="min"
          value={settings.focusMin}
          onDec={() => updateSetting("focusMin", -5, 5, 180)}
          onInc={() => updateSetting("focusMin", 5, 5, 180)}
        />
        <SettingsRow
          title="Break" subtitle="Rest period between sessions" unit="min"
          value={settings.breakMin}
          onDec={() => updateSetting("breakMin", -5, 5, 60)}
          onInc={() => updateSetting("breakMin", 5, 5, 60)}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="DAILY GOAL">
        <SettingsRow
          title="Daily Focus Goal" subtitle="Target focus time per day" unit="min"
          value={settings.dailyGoalMin}
          onDec={() => updateSetting("dailyGoalMin", -15, 15, 720)}
          onInc={() => updateSetting("dailyGoalMin", 15, 15, 720)}
          last
        />
      </SettingsGroup>
      
      <SettingsGroup title="THEMES">
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 14,
    }}
  >
    {themeOptions.map((t) => {
      const preview = {
        midnight: "#818cf8",
        forest: "#3FB950",
        ocean: "#22D3EE",
        sunset: "#FB923C",
        sakura: "#EC4899",
        coffee: "#C08457",
        cyberpunk: "#FF00FF",
        frost: "#60A5FA",
        amoled: "#9F7AEA",
      };

      return (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderRadius: 16,
            cursor: "pointer",
            background: "var(--card)",
            color: "var(--text)",
            border:
              theme === t.id
                ? "2px solid var(--accent)"
                : "1px solid var(--border)",
            boxShadow:
              theme === t.id
                ? "0 0 12px rgba(129,140,248,.25)"
                : "none",
            transition: "all .25s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: preview[t.id],
              }}
            />

            <span
              style={{
                fontWeight: theme === t.id ? 700 : 500,
              }}
            >
              {t.name}
            </span>
          </div>

          {theme === t.id && (
            <span
              style={{
                color: "var(--accent)",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              ✓
            </span>
          )}
        </button>
      );
    })}
  </div>
</SettingsGroup>
    </div>
  );
}

function SettingsGroup({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: "20px 22px", marginBottom: 20 }}>
      <div style={{ color: "var(--muted)", fontSize: 13, letterSpacing: 1.5, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function SettingsRow({ title, subtitle, unit, value, onDec, onInc, last }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div>
        <div style={{ color: "var(--text)", fontSize: 18, fontWeight: 600 }}>{title}</div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={onDec} style={circleBtnStyle("var(--border)", 42)}>
          <Minus size={16} color="#94a3b8" />
        </button>
        <div style={{ textAlign: "center", minWidth: 44 }}>
          <div style={{ color: "var(--text)", fontSize: 22, fontWeight: 700 }}>{value}</div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>{unit}</div>
        </div>
        <button onClick={onInc} style={circleBtnStyle("var(--border)", 42)}>
          <Plus size={16} color="#94a3b8" />
        </button>
      </div>
    </div>
  );
}
