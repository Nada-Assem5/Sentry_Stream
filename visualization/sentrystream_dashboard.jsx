import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  ShieldAlert, ShieldCheck, Activity, Radio, Clock, Bell, BellOff,
  Camera, Thermometer, Lock, RadioTower, Plug, Baby, Tv, Router,
  Power, Wifi, LayoutDashboard, MonitorSmartphone, Download, Pause, Play,
  BarChart2, LineChart as LineIcon, Layers, Eye, EyeOff
} from "lucide-react";

// ---------- Fixed device list (swap srcIp / feed for real API data at integration time) ----------
const DEVICE_ICONS = {
  "Smart Camera": Camera, "Thermostat": Thermometer, "Door Lock": Lock,
  "Motion Sensor": RadioTower, "Smart Plug": Plug, "Baby Monitor": Baby,
  "Smart TV": Tv, "Router": Router,
};

function randIP() {
  return `192.168.1.${20 + Math.floor(Math.random() * 200)}`;
}

const INITIAL_DEVICES = [
  { id: "dev-1", name: "Living Room Camera", type: "Smart Camera", location: "Living Room" },
  { id: "dev-2", name: "Smart Thermostat", type: "Thermostat", location: "Hallway" },
  { id: "dev-3", name: "Front Door Lock", type: "Door Lock", location: "Entrance" },
  { id: "dev-4", name: "Garage Motion Sensor", type: "Motion Sensor", location: "Garage" },
  { id: "dev-5", name: "Kitchen Smart Plug", type: "Smart Plug", location: "Kitchen" },
  { id: "dev-6", name: "Baby Monitor", type: "Baby Monitor", location: "Nursery" },
  { id: "dev-7", name: "Living Room TV", type: "Smart TV", location: "Living Room" },
  { id: "dev-8", name: "Home Router", type: "Router", location: "Study" },
].map((d) => ({ ...d, ip: randIP(), status: "safe", lastAttackType: null }));

const ATTACK_TYPES = ["DDoS Flood", "Port Scan", "Botnet Activity", "Unauthorized Access Attempt", "Data Interception"];

const ATTACK_TYPE_COLORS = {
  "DDoS Flood": "#FF4D4D",
  "Port Scan": "#FFA500",
  "Botnet Activity": "#A855F7",
  "Unauthorized Access Attempt": "#EC4899",
  "Data Interception": "#3B82F6",
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fmtClock(d) {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? "00:00:00" : dateObj.toLocaleTimeString("en-GB", { hour12: false });
}

// Generate initial continuous historical data points so chart is never empty on load
function generateInitialChartData(count = 20) {
  const data = [];
  const nowMs = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = nowMs - i * 2000;
    const dateObj = new Date(timestamp);
    const normal = Math.floor(18 + Math.random() * 22);
    const attack = Math.random() < 0.35 ? Math.floor(8 + Math.random() * 24) : Math.floor(1 + Math.random() * 4);

    const ddos = attack > 0 ? Math.floor(attack * 0.4) : 0;
    const scan = attack > 0 ? Math.floor(attack * 0.25) : 0;
    const botnet = attack > 0 ? Math.floor(attack * 0.2) : 0;
    const auth = attack > 0 ? Math.floor(attack * 0.1) : 0;
    const dataIntercept = attack > 0 ? Math.max(0, attack - (ddos + scan + botnet + auth)) : 0;

    data.push({
      timestamp,
      t: fmtClock(dateObj),
      normal: Number(normal) || 0,
      attack: Number(attack) || 0,
      "DDoS Flood": Number(ddos) || 0,
      "Port Scan": Number(scan) || 0,
      "Botnet Activity": Number(botnet) || 0,
      "Unauthorized Access Attempt": Number(auth) || 0,
      "Data Interception": Number(dataIntercept) || 0,
    });
  }
  return data;
}

export default function Dashboard() {
  const [tab, setTab] = useState("monitor");
  const [now, setNow] = useState(new Date());
  const [devices, setDevices] = useState(INITIAL_DEVICES);
  const [stream, setStream] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  // Seed chartData with initial historical timeline
  const [chartData, setChartData] = useState(() => generateInitialChartData(20));
  
  // Initial total counters calculated from initial seed data
  const initialTotals = chartData.reduce(
    (acc, cur) => ({
      total: acc.total + cur.normal + cur.attack,
      normal: acc.normal + cur.normal,
      attack: acc.attack + cur.attack,
    }),
    { total: 0, normal: 0, attack: 0 }
  );
  
  const [totals, setTotals] = useState(initialTotals);
  const [soundOn, setSoundOn] = useState(false);

  // Interactive Chart Controls State
  const [chartType, setChartType] = useState("area"); // "area", "line", "bar"
  const [timeWindow, setTimeWindow] = useState(20); // 15, 20, 30, 50, 100
  const [isPaused, setIsPaused] = useState(false);
  const [breakdownMode, setBreakdownMode] = useState(false); // false = Overview (Safe vs Attack), true = Attack Breakdown
  const [visibleSeries, setVisibleSeries] = useState({
    normal: true,
    attack: true,
    "DDoS Flood": true,
    "Port Scan": true,
    "Botnet Activity": true,
    "Unauthorized Access Attempt": true,
    "Data Interception": true,
  });

  const idRef = useRef(0);
  const bucketRef = useRef({
    normal: 0,
    attack: 0,
    types: {
      "DDoS Flood": 0,
      "Port Scan": 0,
      "Botnet Activity": 0,
      "Unauthorized Access Attempt": 0,
      "Data Interception": 0,
    },
  });
  const devicesRef = useRef(devices);
  const soundOnRef = useRef(soundOn);
  const isPausedRef = useRef(isPaused);
  const audioCtxRef = useRef(null);

  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const playAlertSound = useCallback(() => {
    if (!soundOnRef.current) return;
    try {
      const ctx = audioCtxRef.current || (audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)());
      [880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, ctx.currentTime + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.16);
        osc.stop(ctx.currentTime + i * 0.16 + 0.15);
      });
    } catch (e) { /* audio unavailable, fail silently */ }
  }, []);

  const pushRecord = useCallback(() => {
    const pool = devicesRef.current.filter((d) => d.status !== "isolated");
    if (pool.length === 0) return;
    const device = pick(pool);
    const isAttack = Math.random() < 0.18;
    idRef.current += 1;
    const attackType = isAttack ? pick(ATTACK_TYPES) : null;
    
    // Simulate flow volume packets per event
    const flowVolume = isAttack ? Math.floor(6 + Math.random() * 10) : Math.floor(5 + Math.random() * 8);

    const rec = {
      id: idRef.current,
      time: new Date(),
      deviceId: device.id,
      deviceName: device.name,
      location: device.location,
      ip: device.ip,
      label: isAttack ? "attack" : "normal",
      attackType: attackType,
      confidence: (0.84 + Math.random() * 0.15).toFixed(2),
    };

    setStream((prev) => [rec, ...prev].slice(0, 14));
    setTotals((prev) => ({
      total: prev.total + flowVolume,
      normal: prev.normal + (isAttack ? 0 : flowVolume),
      attack: prev.attack + (isAttack ? flowVolume : 0),
    }));

    if (isAttack) {
      bucketRef.current.attack += flowVolume;
      if (attackType) {
        bucketRef.current.types[attackType] = (bucketRef.current.types[attackType] || 0) + flowVolume;
      }
    } else {
      bucketRef.current.normal += flowVolume;
    }

    if (isAttack) {
      setAlerts((prev) => [rec, ...prev].slice(0, 8));
      setDevices((prev) => prev.map((d) => d.id === device.id ? { ...d, status: "attack", lastAttackType: rec.attackType } : d));
      playAlertSound();
    }
  }, [playAlertSound]);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const stream = setInterval(() => {
      if (!isPausedRef.current) pushRecord();
    }, 900);
    
    const chartTick = setInterval(() => {
      if (!isPausedRef.current) {
        setChartData((prev) => {
          const nowObj = new Date();
          const activeAttacks = devicesRef.current.filter((d) => d.status === "attack");

          let normVal = bucketRef.current.normal;
          let atkVal = bucketRef.current.attack;

          // Supply baseline traffic volume if bucket was idle
          if (normVal === 0) {
            normVal = Math.floor(15 + Math.random() * 15);
          }
          // Boost attack volume if devices are actively under attack
          if (activeAttacks.length > 0) {
            const attackBoost = activeAttacks.length * Math.floor(12 + Math.random() * 15);
            atkVal = Math.max(atkVal, attackBoost);
          } else if (atkVal === 0) {
            atkVal = Math.floor(1 + Math.random() * 3);
          }

          normVal = Math.max(0, Number(normVal) || 0);
          atkVal = Math.max(0, Number(atkVal) || 0);

          const ddos = Number(bucketRef.current.types["DDoS Flood"]) || (atkVal > 0 ? Math.floor(atkVal * 0.4) : 0);
          const scan = Number(bucketRef.current.types["Port Scan"]) || (atkVal > 0 ? Math.floor(atkVal * 0.25) : 0);
          const botnet = Number(bucketRef.current.types["Botnet Activity"]) || (atkVal > 0 ? Math.floor(atkVal * 0.2) : 0);
          const auth = Number(bucketRef.current.types["Unauthorized Access Attempt"]) || (atkVal > 0 ? Math.floor(atkVal * 0.1) : 0);
          const dataIntercept = Number(bucketRef.current.types["Data Interception"]) || (atkVal > 0 ? Math.max(0, atkVal - (ddos + scan + botnet + auth)) : 0);

          const entry = {
            timestamp: nowObj.getTime(),
            t: fmtClock(nowObj),
            normal: normVal,
            attack: atkVal,
            "DDoS Flood": ddos,
            "Port Scan": scan,
            "Botnet Activity": botnet,
            "Unauthorized Access Attempt": auth,
            "Data Interception": dataIntercept,
          };

          bucketRef.current = {
            normal: 0,
            attack: 0,
            types: {
              "DDoS Flood": 0,
              "Port Scan": 0,
              "Botnet Activity": 0,
              "Unauthorized Access Attempt": 0,
              "Data Interception": 0,
            },
          };

          const updated = [...prev, entry].sort((a, b) => a.timestamp - b.timestamp);
          return updated.slice(-100);
        });
      }
    }, 2000);
    return () => { clearInterval(clock); clearInterval(stream); clearInterval(chartTick); };
  }, [pushRecord]);

  const toggleSeries = (key) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const exportCSV = () => {
    if (chartData.length === 0) return;
    const keys = breakdownMode
      ? ["t", "normal", ...ATTACK_TYPES]
      : ["t", "normal", "attack"];
    
    const header = breakdownMode
      ? "Time,Safe Traffic,DDoS Flood,Port Scan,Botnet Activity,Unauthorized Access,Data Interception"
      : "Time,Safe Traffic,Attack Traffic";

    const rows = chartData.map((row) => keys.map((k) => row[k] ?? 0).join(","));
    const csvStr = [header, ...rows].join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentrystream_traffic_data_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isolateDevice = (id) => setDevices((prev) => prev.map((d) => d.id === id ? { ...d, status: "isolated" } : d));
  const reconnectDevice = (id) => setDevices((prev) => prev.map((d) => d.id === id ? { ...d, status: "safe", lastAttackType: null } : d));

  const attackedDevices = devices.filter((d) => d.status === "attack");
  const detectionRate = totals.total ? ((totals.attack / totals.total) * 100).toFixed(1) : "0.0";
  
  // Ensure displayed chart data is valid, non-null, and sorted
  const displayedChartData = chartData
    .filter((d) => d && typeof d.normal === "number" && typeof d.attack === "number")
    .slice(-timeWindow);

  // Custom tooltip formatter ensuring clean numerical display
  const renderTooltipContent = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div style={styles.tooltipContainer}>
        <div style={styles.tooltipLabel}>Time: {label}</div>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} style={{ ...styles.tooltipItem, color: entry.color }}>
            <span style={{ fontWeight: 600 }}>{entry.name}:</span>
            <span> {(Number(entry.value) || 0).toLocaleString()} pkts/s</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cardPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,93,93,0.4);} 50% { box-shadow: 0 0 0 6px rgba(255,93,93,0);} }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #263148; border-radius: 4px; }
        .row-in { animation: rowIn 0.35s ease-out; }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.brandBlock}>
          <div style={styles.logoMark}><Radio size={18} color="#0A0E17" /></div>
          <div>
            <div style={styles.brandName}>SENTRYSTREAM</div>
            <div style={styles.brandSub}>Live security monitor for your connected devices</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button onClick={() => setSoundOn((s) => !s)} style={{ ...styles.soundBtn, ...(soundOn ? styles.soundBtnOn : {}) }}>
            {soundOn ? <Bell size={14} /> : <BellOff size={14} />}
            {soundOn ? "Sound On" : "Sound Off"}
          </button>
          <div style={styles.liveTag}>
            <span style={{ ...styles.liveDot, background: isPaused ? "#F5A623" : "#FF5D5D" }} />
            {isPaused ? "PAUSED" : "LIVE"}
          </div>
          <div style={styles.clockBlock}><Clock size={14} color="#8B96A8" /><span style={styles.clockText}>{fmtClock(now)}</span></div>
        </div>
      </div>

      {/* Status banner */}
      {attackedDevices.length > 0 ? (
        <div style={styles.bannerAlert}>
          <ShieldAlert size={20} color="#FF5D5D" />
          <div>
            <div style={styles.bannerTitle}>{attackedDevices.length} device{attackedDevices.length > 1 ? "s" : ""} under attack right now</div>
            <div style={styles.bannerSub}>{attackedDevices.map((d) => d.name).join(", ")} — go to the Devices tab to disconnect {attackedDevices.length > 1 ? "them" : "it"}.</div>
          </div>
        </div>
      ) : (
        <div style={styles.bannerSafe}>
          <ShieldCheck size={20} color="#2DD4BF" />
          <div style={styles.bannerTitle}>All devices are protected</div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabRow}>
        <button onClick={() => setTab("monitor")} style={{ ...styles.tabBtn, ...(tab === "monitor" ? styles.tabBtnActive : {}) }}>
          <LayoutDashboard size={14} /> Live Monitor
        </button>
        <button onClick={() => setTab("devices")} style={{ ...styles.tabBtn, ...(tab === "devices" ? styles.tabBtnActive : {}) }}>
          <MonitorSmartphone size={14} /> Connected Devices
          {attackedDevices.length > 0 && <span style={styles.tabBadge}>{attackedDevices.length}</span>}
        </button>
      </div>

      {tab === "monitor" ? (
        <>
          <div style={styles.statsRow}>
            <StatCard icon={<Activity size={16} color="#6C7CFF" />} label="Traffic Checked" value={totals.total.toLocaleString()} accent="#6C7CFF" />
            <StatCard icon={<ShieldCheck size={16} color="#2DD4BF" />} label="Safe" value={totals.normal.toLocaleString()} accent="#2DD4BF" />
            <StatCard icon={<ShieldAlert size={16} color="#FF5D5D" />} label="Attacks Detected" value={totals.attack.toLocaleString()} accent="#FF5D5D" />
            <StatCard icon={<Activity size={16} color="#F5A623" />} label="Attack Rate" value={`${detectionRate}%`} accent="#F5A623" />
          </div>

          <div style={styles.mainGrid}>
            <div style={styles.panel}>
              {/* Traffic Over Time Header & Actions */}
              <div style={styles.chartHeaderRow}>
                <div>
                  <div style={styles.panelTitle}>Traffic Over Time</div>
                  <div style={styles.panelSubtitle}>How much safe vs. attack traffic is passing through</div>
                </div>
                <div style={styles.chartActions}>
                  <button
                    onClick={() => setIsPaused((p) => !p)}
                    style={{ ...styles.actionBtn, ...(isPaused ? styles.actionBtnActive : {}) }}
                    title={isPaused ? "Resume Stream" : "Pause Stream"}
                  >
                    {isPaused ? <Play size={13} color="#2DD4BF" /> : <Pause size={13} color="#F5A623" />}
                    <span>{isPaused ? "Resume" : "Pause"}</span>
                  </button>
                  <button onClick={exportCSV} style={styles.actionBtn} title="Export CSV Data">
                    <Download size={13} color="#6C7CFF" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Chart Toolbar Controls */}
              <div style={styles.toolbarRow}>
                {/* Time range selector */}
                <div style={styles.toolGroup}>
                  <span style={styles.toolLabel}>Points:</span>
                  {[15, 30, 50, 100].map((num) => (
                    <button
                      key={num}
                      onClick={() => setTimeWindow(num)}
                      style={{ ...styles.pillBtn, ...(timeWindow === num ? styles.pillBtnActive : {}) }}
                    >
                      {num === 100 ? "Max" : `${num}t`}
                    </button>
                  ))}
                </div>

                {/* Chart type selector */}
                <div style={styles.toolGroup}>
                  <span style={styles.toolLabel}>Type:</span>
                  <button
                    onClick={() => setChartType("area")}
                    style={{ ...styles.iconPill, ...(chartType === "area" ? styles.pillBtnActive : {}) }}
                    title="Area Chart"
                  >
                    <Activity size={13} /> Area
                  </button>
                  <button
                    onClick={() => setChartType("line")}
                    style={{ ...styles.iconPill, ...(chartType === "line" ? styles.pillBtnActive : {}) }}
                    title="Line Chart"
                  >
                    <LineIcon size={13} /> Line
                  </button>
                  <button
                    onClick={() => setChartType("bar")}
                    style={{ ...styles.iconPill, ...(chartType === "bar" ? styles.pillBtnActive : {}) }}
                    title="Bar Chart"
                  >
                    <BarChart2 size={13} /> Bar
                  </button>
                </div>

                {/* View Breakdown toggle */}
                <div style={styles.toolGroup}>
                  <button
                    onClick={() => setBreakdownMode((b) => !b)}
                    style={{ ...styles.iconPill, ...(breakdownMode ? styles.breakdownActive : {}) }}
                  >
                    <Layers size={13} /> {breakdownMode ? "Attack Breakdown" : "Safe vs Attack"}
                  </button>
                </div>
              </div>

              {/* Interactive Legend / Series Toggles */}
              <div style={styles.legendBar}>
                {!breakdownMode ? (
                  <>
                    <button
                      onClick={() => toggleSeries("normal")}
                      style={{ ...styles.legendBadge, opacity: visibleSeries.normal ? 1 : 0.4 }}
                    >
                      {visibleSeries.normal ? <Eye size={11} color="#2DD4BF" /> : <EyeOff size={11} color="#8B96A8" />}
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2DD4BF", display: "inline-block" }} />
                      <span>Safe Traffic</span>
                    </button>
                    <button
                      onClick={() => toggleSeries("attack")}
                      style={{ ...styles.legendBadge, opacity: visibleSeries.attack ? 1 : 0.4 }}
                    >
                      {visibleSeries.attack ? <Eye size={11} color="#FF5D5D" /> : <EyeOff size={11} color="#8B96A8" />}
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5D5D", display: "inline-block" }} />
                      <span>Total Attack Traffic</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleSeries("normal")}
                      style={{ ...styles.legendBadge, opacity: visibleSeries.normal ? 1 : 0.4 }}
                    >
                      {visibleSeries.normal ? <Eye size={11} color="#2DD4BF" /> : <EyeOff size={11} color="#8B96A8" />}
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2DD4BF", display: "inline-block" }} />
                      <span>Safe</span>
                    </button>
                    {ATTACK_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleSeries(type)}
                        style={{ ...styles.legendBadge, opacity: visibleSeries[type] ? 1 : 0.4 }}
                      >
                        {visibleSeries[type] ? <Eye size={11} color={ATTACK_TYPE_COLORS[type]} /> : <EyeOff size={11} color="#8B96A8" />}
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ATTACK_TYPE_COLORS[type], display: "inline-block" }} />
                        <span>{type}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Dynamic Chart Container */}
              <div style={{ height: 240, marginTop: 8, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "area" ? (
                    <AreaChart data={displayedChartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="normalFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="attackFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF5D5D" stopOpacity={0.65} />
                          <stop offset="100%" stopColor="#FF5D5D" stopOpacity={0.05} />
                        </linearGradient>
                        {ATTACK_TYPES.map((t) => (
                          <linearGradient key={t} id={`fill_${t.replace(/\s+/g, '_')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={ATTACK_TYPE_COLORS[t]} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={ATTACK_TYPE_COLORS[t]} stopOpacity={0.05} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid stroke="#1B2434" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "#1F2937" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={25}
                      />
                      <YAxis
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                        domain={[0, (dataMax) => Math.max(Math.ceil(dataMax * 1.15), 10)]}
                        allowDecimals={false}
                      />
                      <Tooltip content={renderTooltipContent} />
                      
                      {visibleSeries.normal && (
                        <Area type="monotone" dataKey="normal" name="Safe Traffic" stroke="#2DD4BF" strokeWidth={2.5} fill="url(#normalFill)" />
                      )}
                      
                      {!breakdownMode ? (
                        visibleSeries.attack && (
                          <Area type="monotone" dataKey="attack" name="Attack Traffic" stroke="#FF5D5D" strokeWidth={2.5} fill="url(#attackFill)" />
                        )
                      ) : (
                        ATTACK_TYPES.map((type) => (
                          visibleSeries[type] && (
                            <Area key={type} type="monotone" dataKey={type} name={type} stroke={ATTACK_TYPE_COLORS[type]} strokeWidth={2} fill={`url(#fill_${type.replace(/\s+/g, '_')})`} />
                          )
                        ))
                      )}
                    </AreaChart>
                  ) : chartType === "line" ? (
                    <LineChart data={displayedChartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#1B2434" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "#1F2937" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={25}
                      />
                      <YAxis
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                        domain={[0, (dataMax) => Math.max(Math.ceil(dataMax * 1.15), 10)]}
                        allowDecimals={false}
                      />
                      <Tooltip content={renderTooltipContent} />
                      
                      {visibleSeries.normal && (
                        <Line type="monotone" dataKey="normal" name="Safe Traffic" stroke="#2DD4BF" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                      )}

                      {!breakdownMode ? (
                        visibleSeries.attack && (
                          <Line type="monotone" dataKey="attack" name="Attack Traffic" stroke="#FF5D5D" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                        )
                      ) : (
                        ATTACK_TYPES.map((type) => (
                          visibleSeries[type] && (
                            <Line key={type} type="monotone" dataKey={type} name={type} stroke={ATTACK_TYPE_COLORS[type]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          )
                        ))
                      )}
                    </LineChart>
                  ) : (
                    <BarChart data={displayedChartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#1B2434" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "#1F2937" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={25}
                      />
                      <YAxis
                        tick={{ fill: "#5C6B84", fontSize: 10, fontFamily: "JetBrains Mono" }}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                        domain={[0, (dataMax) => Math.max(Math.ceil(dataMax * 1.15), 10)]}
                        allowDecimals={false}
                      />
                      <Tooltip content={renderTooltipContent} />
                      
                      {visibleSeries.normal && (
                        <Bar dataKey="normal" name="Safe Traffic" fill="#2DD4BF" radius={[3, 3, 0, 0]} />
                      )}

                      {!breakdownMode ? (
                        visibleSeries.attack && (
                          <Bar dataKey="attack" name="Attack Traffic" fill="#FF5D5D" radius={[3, 3, 0, 0]} />
                        )
                      ) : (
                        ATTACK_TYPES.map((type) => (
                          visibleSeries[type] && (
                            <Bar key={type} dataKey={type} name={type} fill={ATTACK_TYPE_COLORS[type]} radius={[3, 3, 0, 0]} />
                          )
                        ))
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.panel}>
              <PanelHeader title="Recent Alerts" subtitle={`${alerts.length} shown`} />
              <div style={styles.alertList}>
                {alerts.length === 0 && <div style={styles.emptyState}>No attacks detected yet.</div>}
                {alerts.map((a) => (
                  <div key={a.id} className="row-in" style={styles.alertRow}>
                    <div style={styles.alertDot} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.alertType}>{a.attackType}</div>
                      <div style={styles.alertMeta}>{a.deviceName} · {a.location}</div>
                    </div>
                    <div style={styles.alertTime}>{fmtClock(a.time)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.panel}>
            <PanelHeader title="Live Traffic Feed" subtitle="Every device flow, checked as it happens" />
            <div style={styles.tickerHeaderRow}>
              <span style={{ width: 80 }}>TIME</span>
              <span style={{ width: 170 }}>DEVICE</span>
              <span style={{ width: 130 }}>LOCATION</span>
              <span style={{ width: 90 }}>CONFIDENCE</span>
              <span>RESULT</span>
            </div>
            <div style={styles.tickerBody}>
              {stream.map((r) => (
                <div key={r.id} className="row-in" style={styles.tickerRow}>
                  <span style={{ ...styles.mono, width: 80, color: "#5C6B84" }}>{fmtClock(r.time)}</span>
                  <span style={{ width: 170, color: "#E7ECF5" }}>{r.deviceName}</span>
                  <span style={{ width: 130, color: "#8B96A8" }}>{r.location}</span>
                  <span style={{ ...styles.mono, width: 90, color: "#5C6B84" }}>{r.confidence}</span>
                  <span style={{ flex: 1 }}>
                    {r.label === "attack"
                      ? <span style={styles.badgeAttack}><ShieldAlert size={11} /> {r.attackType}</span>
                      : <span style={styles.badgeNormal}><ShieldCheck size={11} /> Safe</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={styles.panel}>
          <PanelHeader title="Connected Devices" subtitle="Disconnect any device that's under attack, reconnect it once it's safe" />
          <div style={styles.deviceGrid}>
            {devices.map((d) => {
              const Icon = DEVICE_ICONS[d.type] || Camera;
              const isAttack = d.status === "attack";
              const isIsolated = d.status === "isolated";
              return (
                <div key={d.id} style={{ ...styles.deviceCard, ...(isAttack ? styles.deviceCardAttack : {}) }}>
                  <div style={styles.deviceTop}>
                    <div style={{ ...styles.deviceIconWrap, background: isAttack ? "rgba(255,93,93,0.15)" : isIsolated ? "rgba(139,150,168,0.15)" : "rgba(45,212,191,0.15)" }}>
                      <Icon size={18} color={isAttack ? "#FF5D5D" : isIsolated ? "#8B96A8" : "#2DD4BF"} />
                    </div>
                    <StatusPill status={d.status} />
                  </div>
                  <div style={styles.deviceName}>{d.name}</div>
                  <div style={styles.deviceMeta}>{d.location} · {d.ip}</div>
                  {isAttack && <div style={styles.deviceAttackNote}>Detected: {d.lastAttackType}</div>}

                  {isIsolated ? (
                    <button onClick={() => reconnectDevice(d.id)} style={styles.reconnectBtn}>
                      <Wifi size={13} /> Reconnect Device
                    </button>
                  ) : (
                    <button onClick={() => isolateDevice(d.id)} style={{ ...styles.isolateBtn, ...(isAttack ? styles.isolateBtnUrgent : {}) }}>
                      <Power size={13} /> {isAttack ? "Disconnect Now" : "Disconnect Device"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={styles.footer}>Pipeline: Kafka → Spark Structured Streaming → HDFS / HBase / Elasticsearch → Dashboard</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    safe: { label: "Protected", color: "#2DD4BF", bg: "rgba(45,212,191,0.12)" },
    attack: { label: "Under Attack", color: "#FF5D5D", bg: "rgba(255,93,93,0.14)" },
    isolated: { label: "Disconnected", color: "#8B96A8", bg: "rgba(139,150,168,0.14)" },
  };
  const s = map[status];
  return <span style={{ fontSize: 10.5, fontWeight: 600, color: s.color, background: s.bg, padding: "3px 8px", borderRadius: 20 }}>{s.label}</span>;
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div style={{ ...styles.statCard, borderTopColor: accent }}>
      <div style={styles.statIconRow}>{icon}<span style={styles.statLabel}>{label}</span></div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function PanelHeader({ title, subtitle }) {
  return (
    <div style={styles.panelHeaderRow}>
      <div>
        <div style={styles.panelTitle}>{title}</div>
        <div style={styles.panelSubtitle}>{subtitle}</div>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: "100%", background: "#0A0E17", color: "#E7ECF5", fontFamily: "'Inter', sans-serif", padding: "20px", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: "1px solid #1B2434" },
  brandBlock: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6C7CFF, #2DD4BF)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandName: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em" },
  brandSub: { fontSize: 11, color: "#5C6B84", marginTop: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 14 },
  soundBtn: { display: "flex", alignItems: "center", gap: 6, background: "#161F32", border: "1px solid #263148", color: "#8B96A8", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 20, cursor: "pointer" },
  soundBtnOn: { color: "#2DD4BF", borderColor: "#2DD4BF44", background: "rgba(45,212,191,0.08)" },
  liveTag: { display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#FF5D5D", letterSpacing: "0.08em" },
  liveDot: { width: 7, height: 7, borderRadius: "50%", background: "#FF5D5D", animation: "pulse 1.6s ease-in-out infinite" },
  clockBlock: { display: "flex", alignItems: "center", gap: 6 },
  clockText: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#8B96A8" },

  bannerAlert: { display: "flex", alignItems: "center", gap: 12, background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.35)", borderRadius: 10, padding: "12px 16px" },
  bannerSafe: { display: "flex", alignItems: "center", gap: 12, background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.25)", borderRadius: 10, padding: "12px 16px" },
  bannerTitle: { fontSize: 13.5, fontWeight: 600 },
  bannerSub: { fontSize: 11.5, color: "#8B96A8", marginTop: 2 },

  tabRow: { display: "flex", gap: 8 },
  tabBtn: { display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "1px solid #1B2434", color: "#8B96A8", fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer" },
  tabBtnActive: { background: "#161F32", color: "#E7ECF5", borderColor: "#2A3752" },
  tabBadge: { background: "#FF5D5D", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px", marginLeft: 4 },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  statCard: { background: "#121826", border: "1px solid #1B2434", borderTop: "2px solid", borderRadius: 10, padding: "14px 16px" },
  statIconRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  statLabel: { fontSize: 11, color: "#8B96A8", fontWeight: 500 },
  statValue: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700 },

  mainGrid: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 },
  panel: { background: "#121826", border: "1px solid #1B2434", borderRadius: 10, padding: "14px 16px" },
  panelHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  panelTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" },
  panelSubtitle: { fontSize: 11, color: "#5C6B84", marginTop: 2 },

  chartHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  chartActions: { display: "flex", alignItems: "center", gap: 8 },
  actionBtn: { display: "flex", alignItems: "center", gap: 5, background: "#161F32", border: "1px solid #263148", color: "#E7ECF5", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, cursor: "pointer", transition: "all 0.15s ease" },
  actionBtnActive: { borderColor: "#F5A623", background: "rgba(245,166,35,0.12)" },

  toolbarRow: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#161F32", border: "1px solid #1E283D", borderRadius: 8, padding: "6px 10px", marginBottom: 8 },
  toolGroup: { display: "flex", alignItems: "center", gap: 6 },
  toolLabel: { fontSize: 11, color: "#5C6B84", fontWeight: 600 },
  pillBtn: { background: "#101622", border: "1px solid #232E45", color: "#8B96A8", fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 5, cursor: "pointer" },
  pillBtnActive: { background: "#6C7CFF", color: "#FFF", borderColor: "#6C7CFF" },
  iconPill: { display: "flex", alignItems: "center", gap: 4, background: "#101622", border: "1px solid #232E45", color: "#8B96A8", fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 5, cursor: "pointer" },
  breakdownActive: { background: "rgba(255,93,93,0.15)", color: "#FF5D5D", borderColor: "rgba(255,93,93,0.4)" },

  legendBar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "4px 0", marginBottom: 4 },
  legendBadge: { display: "flex", alignItems: "center", gap: 5, background: "#141B2B", border: "1px solid #202B42", color: "#E7ECF5", fontSize: 10.5, fontWeight: 500, padding: "3px 8px", borderRadius: 12, cursor: "pointer", userSelect: "none" },

  tooltipContainer: { background: "#131B2E", border: "1px solid #263148", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "'Inter', sans-serif" },
  tooltipLabel: { color: "#8B96A8", fontSize: 11, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" },
  tooltipItem: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11.5, margin: "2px 0" },

  alertList: { marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" },
  emptyState: { fontSize: 12, color: "#5C6B84", padding: "24px 8px", textAlign: "center" },
  alertRow: { display: "flex", alignItems: "center", gap: 10, background: "#161F32", border: "1px solid #232E45", borderRadius: 8, padding: "8px 10px" },
  alertDot: { width: 6, height: 6, borderRadius: "50%", background: "#FF5D5D", flexShrink: 0 },
  alertType: { fontSize: 12.5, fontWeight: 600, color: "#FF9B9B" },
  alertMeta: { fontSize: 11, color: "#5C6B84", marginTop: 1 },
  alertTime: { fontSize: 10.5, color: "#5C6B84", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 },

  tickerHeaderRow: { display: "flex", gap: 4, marginTop: 10, paddingBottom: 8, borderBottom: "1px solid #1B2434", fontSize: 10, color: "#4A5568", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" },
  tickerBody: { display: "flex", flexDirection: "column", maxHeight: 260, overflowY: "auto" },
  tickerRow: { display: "flex", gap: 4, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #141C2C", fontSize: 12 },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  badgeNormal: { display: "inline-flex", alignItems: "center", gap: 4, color: "#2DD4BF", background: "rgba(45,212,191,0.1)", padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500 },
  badgeAttack: { display: "inline-flex", alignItems: "center", gap: 4, color: "#FF5D5D", background: "rgba(255,93,93,0.12)", padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 },

  deviceGrid: { marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  deviceCard: { background: "#161F32", border: "1px solid #232E45", borderRadius: 10, padding: "14px" },
  deviceCardAttack: { border: "1px solid rgba(255,93,93,0.5)", animation: "cardPulse 1.8s ease-in-out infinite" },
  deviceTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  deviceIconWrap: { width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
  deviceName: { fontSize: 13.5, fontWeight: 600 },
  deviceMeta: { fontSize: 11, color: "#5C6B84", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 },
  deviceAttackNote: { fontSize: 11.5, color: "#FF9B9B", marginTop: 8, fontWeight: 500 },
  isolateBtn: { marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#1B2434", border: "1px solid #2A3752", color: "#8B96A8", fontSize: 11.5, fontWeight: 600, padding: "8px", borderRadius: 8, cursor: "pointer" },
  isolateBtnUrgent: { background: "#FF5D5D", borderColor: "#FF5D5D", color: "#1A0505" },
  reconnectBtn: { marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.4)", color: "#2DD4BF", fontSize: 11.5, fontWeight: 600, padding: "8px", borderRadius: 8, cursor: "pointer" },

  footer: { fontSize: 11, color: "#4A5568", fontFamily: "'JetBrains Mono', monospace", padding: "4px 2px 0" },
};
