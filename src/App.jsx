import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, SkipForward, Timer, BarChart3, Settings as SettingsIcon, Zap, Minus, Plus, Check } from "lucide-react";

const DEFAULTS = { focusMin: 60, breakMin: 15, dailyGoalMin: 180 };
const SETTINGS_KEY = "focusflow:settings";
const SESSIONS_KEY = "focusflow:sessions";

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtHM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export default function FocusFlow() {
  const [tab, setTab] = useState("focus");
  const [mode, setMode] = useState("focus");
  const [settings, setSettings] = useState(DEFAULTS);
  const [sessions, setSessions] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULTS.focusMin * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);

  useEffect(() => {
    let loadedSettings = DEFAULTS;
    let loadedSessions = [];
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) loadedSettings = { ...DEFAULTS, ...JSON.parse(s) };
    } catch (e) {}
    try {
      const s = localStorage.getItem(SESSIONS_KEY);
      if (s) loadedSessions = JSON.parse(s);
    } catch (e) {}
    setSettings(loadedSettings);
    setSessions(loadedSessions);
    setSecondsLeft(loadedSettings.focusMin * 60);
    setLoaded(true);
  }, []);

  const persistSettings = useCallback((next) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
  }, []);

  const persistSessions = useCallback((next) => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(next)); } catch (e) {}
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
      };
      setSessions((prev) => {
        const next = [entry, ...prev];
        persistSessions(next);
        return next;
      });
      switchMode("break", true);
    } else {
      switchMode("focus", true);
    }
  }

  function switchMode(next, autoStarted) {
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
      const entry = { id: Date.now(), minutes: minutesDone, completedAt: Date.now(), completed: true };
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

  const today = startOfDay(new Date());
  const todaySessions = sessions.filter((s) => startOfDay(new Date(s.completedAt)).getTime() === today.getTime());
  const todayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);
  const allTimeMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, settings.dailyGoalMin)) * 100));

  let streak = 0;
  {
    const daySet = new Set(sessions.map((s) => dayKey(new Date(s.completedAt))));
    let cursor = new Date();
    while (daySet.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const mins = sessions
      .filter((s) => dayKey(new Date(s.completedAt)) === key)
      .reduce((a, s) => a + s.minutes, 0);
    last7.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), mins, isToday: i === 0 });
  }
  const maxBar = Math.max(60, ...last7.map((d) => d.mins));

  const total = totalSecondsFor(mode);
  const progress = total > 0 ? (total - secondsLeft) / total : 0;
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const gradId = mode === "focus" ? "focusGrad" : "breakGrad";

  if (!loaded) {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh" }} className="flex items-center justify-center">
        <div style={{ color: "#64748b" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }} className="flex justify-center">
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
            />
          )}
          {tab === "stats" && (
            <StatsTab
              todayMinutes={todayMinutes}
              sessionCount={todaySessions.length}
              streak={streak}
              allTimeMinutes={allTimeMinutes}
              dailyGoalMin={settings.dailyGoalMin}
              last7={last7}
              maxBar={maxBar}
              sessions={sessions.slice(0, 8)}
            />
          )}
          {tab === "settings" && (
            <SettingsTab settings={settings} updateSetting={updateSetting} />
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
    <div style={{ borderTop: "1px solid #1e293b", background: "#0a0e1a" }} className="flex justify-around py-3">
      {items.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex flex-col items-center gap-1 px-4"
            style={{ color: active ? "#818cf8" : "#64748b", background: "none", border: "none", cursor: "pointer" }}
          >
            <Icon size={22} strokeWidth={2} />
            <span style={{ fontSize: 13 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FocusTab({ mode, setModeManually, secondsLeft, radius, circumference, dashOffset, gradId, isRunning, onPlayPause, onReset, onSkip, streak, goalPct, todayMinutes, dailyGoalMin }) {
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const accent = mode === "focus" ? "#818cf8" : "#22d3ee";

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 style={{ color: "#f1f5f9", fontSize: 34, fontWeight: 700, margin: 0 }}>FocusFlow</h1>
          <p style={{ color: "#64748b", fontSize: 15, marginTop: 4 }}>Stay focused, reduce distractions</p>
        </div>
        <div style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 999, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <Zap size={14} color="#fbbf24" fill="#fbbf24" />
          <span style={{ color: "#fbbf24", fontSize: 14, fontWeight: 600 }}>{streak} day{streak === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setModeManually("focus")}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 999, border: "none", cursor: "pointer",
            background: mode === "focus" ? "linear-gradient(90deg,#8b7cf6,#6366f1)" : "#131a2a",
            color: mode === "focus" ? "#fff" : "#94a3b8", fontSize: 16, fontWeight: 600,
          }}
        >
          Focus
        </button>
        <button
          onClick={() => setModeManually("break")}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 999, border: "none", cursor: "pointer",
            background: mode === "break" ? "linear-gradient(90deg,#22d3ee,#0ea5e9)" : "#131a2a",
            color: mode === "break" ? "#fff" : "#94a3b8", fontSize: 16, fontWeight: 600,
          }}
        >
          Break
        </button>
      </div>

      <div className="flex justify-center my-10">
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
          <circle cx="145" cy="145" r={radius} fill="none" stroke="#1a2236" strokeWidth="14" />
          <circle
            cx="145" cy="145" r={radius} fill="none"
            stroke={`url(#${gradId})`} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            transform="rotate(-90 145 145)"
            style={{ transition: "stroke-dashoffset 0.3s linear" }}
          />
          <text x="145" y="128" textAnchor="middle" fill="#64748b" fontSize="15" letterSpacing="3" style={{ textTransform: "uppercase" }}>
            {mode === "focus" ? "Focus" : "Short Break"}
          </text>
          <text x="145" y="172" textAnchor="middle" fill="#f1f5f9" fontSize="52" fontWeight="600">
            {pad(mins)}:{pad(secs)}
          </text>
        </svg>
      </div>

      <div className="flex justify-center items-center gap-8 mb-8">
        <button onClick={onReset} style={circleBtnStyle("#131a2a")}>
          <RotateCcw size={20} color="#94a3b8" />
        </button>
        <button onClick={onPlayPause} style={circleBtnStyle(accent, 74)}>
          {isRunning ? <Pause size={28} color="#fff" fill="#fff" /> : <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
        </button>
        <button onClick={onSkip} style={circleBtnStyle("#131a2a")}>
          <SkipForward size={20} color="#94a3b8" />
        </button>
      </div>

      <div style={{ background: "#111726", border: "1px solid #1e293b", borderRadius: 20, padding: 22 }}>
        <div className="flex justify-between items-center mb-3">
          <span style={{ color: "#64748b", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>DAILY GOAL</span>
          <span style={{ color: "#818cf8", fontSize: 15, fontWeight: 700 }}>{goalPct}%</span>
        </div>
        <div style={{ height: 8, background: "#1a2236", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${goalPct}%`, background: "linear-gradient(90deg,#8b7cf6,#38bdf8)", borderRadius: 999, transition: "width 0.3s" }} />
        </div>
        <div style={{ marginTop: 12, color: "#f1f5f9", fontSize: 20, fontWeight: 700 }}>
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

function StatsTab({ todayMinutes, sessionCount, streak, allTimeMinutes, dailyGoalMin, last7, maxBar, sessions }) {
  return (
    <div>
      <h1 style={{ color: "#f1f5f9", fontSize: 34, fontWeight: 700, margin: "0 0 20px" }}>Stats</h1>

      <div className="flex gap-3 mb-5">
        <StatCard icon={<Timer size={20} color="#818cf8" />} value={fmtHM(todayMinutes)} label="Today" />
        <StatCard icon={<Check size={20} color="#22d3ee" />} value={sessionCount} label="Sessions" />
        <StatCard icon={<Zap size={20} color="#fbbf24" fill="#fbbf24" />} value={streak} label="Streak" />
      </div>

      <div style={{ background: "#111726", border: "1px solid #1e293b", borderRadius: 20, padding: 22, marginBottom: 20 }}>
        <div className="flex justify-between mb-2">
          <span style={{ color: "#64748b", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>ALL-TIME FOCUS</span>
          <span style={{ color: "#64748b", fontSize: 13, letterSpacing: 1.5, fontWeight: 600 }}>GOAL</span>
        </div>
        <div className="flex justify-between items-end">
          <span style={{ color: "#f1f5f9", fontSize: 30, fontWeight: 700 }}>{fmtHM(allTimeMinutes)}</span>
          <span style={{ color: "#818cf8", fontSize: 18, fontWeight: 600 }}>{dailyGoalMin}m/day</span>
        </div>
      </div>

      <div style={{ background: "#111726", border: "1px solid #1e293b", borderRadius: 20, padding: 22, marginBottom: 20 }}>
        <h3 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 18px" }}>This Week</h3>
        <div className="flex items-end justify-between" style={{ height: 130 }}>
          {last7.map((d, i) => (
            <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
              {d.isToday && d.mins > 0 && <span style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{d.mins}m</span>}
              <div
                style={{
                  width: "70%", maxWidth: 34,
                  height: Math.max(6, (d.mins / maxBar) * 100),
                  background: d.isToday ? "linear-gradient(180deg,#8b7cf6,#6366f1)" : "#1a2236",
                  borderRadius: 6,
                }}
              />
              <span style={{ color: d.isToday ? "#818cf8" : "#64748b", fontSize: 13, marginTop: 8 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#111726", border: "1px solid #1e293b", borderRadius: 20, padding: 22 }}>
        <h3 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>Recent Sessions</h3>
        {sessions.length === 0 && <p style={{ color: "#64748b", fontSize: 14 }}>No sessions yet — finish a focus timer to see it here.</p>}
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between" style={{ padding: "10px 0", borderTop: "1px solid #1a2236" }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#818cf8" }} />
              <div>
                <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600 }}>{fmtHM(s.minutes)}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>
                  {new Date(s.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </div>
            <Check size={18} color="#34d399" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div style={{ flex: 1, background: "#111726", border: "1px solid #1e293b", borderRadius: 18, padding: "18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {icon}
      <span style={{ color: "#f1f5f9", fontSize: 24, fontWeight: 700 }}>{value}</span>
      <span style={{ color: "#64748b", fontSize: 13 }}>{label}</span>
    </div>
  );
}

function SettingsTab({ settings, updateSetting }) {
  return (
    <div>
      <h1 style={{ color: "#f1f5f9", fontSize: 34, fontWeight: 700, margin: 0 }}>Settings</h1>
      <p style={{ color: "#64748b", fontSize: 15, margin: "4px 0 24px" }}>Customize your focus sessions</p>

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
    </div>
  );
}

function SettingsGroup({ title, children }) {
  return (
    <div style={{ background: "#111726", border: "1px solid #1e293b", borderRadius: 20, padding: "20px 22px", marginBottom: 20 }}>
      <div style={{ color: "#64748b", fontSize: 13, letterSpacing: 1.5, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function SettingsRow({ title, subtitle, unit, value, onDec, onInc, last }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 0", borderBottom: last ? "none" : "1px solid #1a2236" }}>
      <div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 600 }}>{title}</div>
        <div style={{ color: "#64748b", fontSize: 14, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={onDec} style={circleBtnStyle("#1a2236", 42)}>
          <Minus size={16} color="#94a3b8" />
        </button>
        <div style={{ textAlign: "center", minWidth: 44 }}>
          <div style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700 }}>{value}</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>{unit}</div>
        </div>
        <button onClick={onInc} style={circleBtnStyle("#1a2236", 42)}>
          <Plus size={16} color="#94a3b8" />
        </button>
      </div>
    </div>
  );
}
