import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION — Modifier ici si besoin
// ═══════════════════════════════════════════════════════════════

const PEOPLE = [
  { name: "Badia",      color: "#E07A4F", bg: "#FBF0EB", role: "principale"  },
  { name: "Abdelilah", color: "#3A82C3", bg: "#EBF3FB", role: "principal"   },
  { name: "Amina",     color: "#2BA06A", bg: "#E8F7F0", role: "principale"  },
  { name: "Naïma",     color: "#8B5BAF", bg: "#F3EEF8", role: "principale"  },
  { name: "Souad",     color: "#C94B6A", bg: "#FBECF0", role: "principale"  },
  { name: "Touria",    color: "#B08A10", bg: "#F8F3E8", role: "remplaçante" },
  { name: "Mohamed",   color: "#2498A0", bg: "#E8F5F7", role: "remplaçant"  },
];

const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEKDAYS_FULL  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const MONTHS_FR      = ["Janvier","Février","Mars","Avril","Mai","Juin",
                        "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ═══════════════════════════════════════════════════════════════
//  🔥 MIGRATION FIREBASE — À décommenter pour déploiement hors Claude
//
//  import { initializeApp } from 'firebase/app';
//  import { getFirestore, doc, onSnapshot, runTransaction,
//           setDoc, serverTimestamp } from 'firebase/firestore';
//
//  const FIREBASE_CONFIG = {
//    apiKey:            "VOTRE_API_KEY",
//    authDomain:        "VOTRE_PROJECT.firebaseapp.com",
//    projectId:         "VOTRE_PROJECT_ID",
//    storageBucket:     "VOTRE_PROJECT.appspot.com",
//    messagingSenderId: "VOTRE_SENDER_ID",
//    appId:             "VOTRE_APP_ID"
//  };
//  const app = initializeApp(FIREBASE_CONFIG);
//  const db  = getFirestore(app);
//
//  Remplacer safeGet/safeSet par des appels Firestore.
//  Remplacer le setInterval par onSnapshot() pour du vrai temps réel.
// ═══════════════════════════════════════════════════════════════

// ── Couche stockage (window.storage → remplaçable par Firebase) ─

const safeGet = async (key) => {
  try {
    const r = await window.storage.get(key, true);
    return r?.value ? JSON.parse(r.value) : null;
  } catch { return null; }
};

const safeSet = async (key, val) => {
  try {
    await window.storage.set(key, JSON.stringify(val), true);
    return true;
  } catch (e) { console.error("Storage error:", e); return false; }
};

const KEYS = {
  plan:      (y, m) => `maman-plan-${y}-${m}`,
  indispo:   (y, m) => `maman-indispo-${y}-${m}`,
  exchanges: ()     => `maman-echanges-v3`,
  template:  ()     => `maman-template-v1`,
};

// ── Helpers ─────────────────────────────────────────────────────

const getDaysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstWeekday = (y, m) => { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; };
const personFor       = (name) => PEOPLE.find(p => p.name === name);
const genId           = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatDateShort = (day, month) => `${day} ${MONTHS_FR[month]}`;
const formatDateFull  = (day, month, year) => {
  const wd = new Date(year, month, day).getDay();
  return `${WEEKDAYS_FULL[wd === 0 ? 6 : wd - 1]} ${day} ${MONTHS_FR[month]}`;
};

// ═══════════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const now = new Date();

  // ── État principal ───────────────────────────────────────────
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth());
  const [planning,   setPlanning]   = useState({});   // { day: prénom }
  const [indispo,    setIndispo]    = useState({});   // { day: [prénoms] }
  const [exchanges,  setExchanges]  = useState([]);   // tableau d'échanges
  const [template,   setTemplate]   = useState({});   // { 0..6: prénom } (0=Lundi)
  const [view,       setView]       = useState("calendar");
  const [selectedDay, setSelectedDay] = useState(null);
  const [sheetOpen,  setSheetOpen]  = useState(false);
  const [toast,      setToast]      = useState(null); // { msg, type }
  const [confirm,    setConfirm]    = useState(null); // { msg, onConfirm }
  const [syncing,    setSyncing]    = useState(false);
  const [lastSync,   setLastSync]   = useState(null);
  const toastTimer = useRef(null);

  // ── Police ──────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap";
    link.rel  = "stylesheet";
    document.head.appendChild(link);
    document.body.style.margin = "0";
    document.body.style.background = "#FFF8F3";
  }, []);

  // ── Toast ───────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const showConfirm = useCallback((msg, onConfirm) => setConfirm({ msg, onConfirm }), []);

  // ── Chargement des données ───────────────────────────────────
  const loadData = useCallback(async () => {
    setSyncing(true);
    const [p, i, e, t] = await Promise.all([
      safeGet(KEYS.plan(year, month)),
      safeGet(KEYS.indispo(year, month)),
      safeGet(KEYS.exchanges()),
      safeGet(KEYS.template()),
    ]);
    setPlanning(p || {});
    setIndispo(i || {});
    setExchanges(e || []);
    setTemplate(t || {});
    setLastSync(new Date());
    setSyncing(false);
  }, [year, month]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 18000);
    return () => clearInterval(iv);
  }, [loadData]);

  // ── Actions ─────────────────────────────────────────────────

  const assignDay = async (day, name) => {
    const next = { ...planning, [day]: name };
    setPlanning(next);
    await safeSet(KEYS.plan(year, month), next);
    showToast(`✅ ${name} — ${formatDateShort(day, month)}`);
  };

  const clearDay = async (day) => {
    const next = { ...planning };
    delete next[day];
    setPlanning(next);
    await safeSet(KEYS.plan(year, month), next);
    showToast("Journée effacée", "info");
  };

  const toggleIndispo = async (day, name) => {
    const cur  = indispo[day] || [];
    const next = cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name];
    const obj  = { ...indispo };
    if (next.length === 0) delete obj[day]; else obj[day] = next;
    setIndispo(obj);
    await safeSet(KEYS.indispo(year, month), obj);
  };

  const proposeExchange = async (day) => {
    const from = planning[day];
    if (!from) return;
    if (exchanges.some(e => e.day === day && e.month === month && e.year === year && e.status === "open")) {
      showToast("Un échange est déjà proposé pour ce jour", "info");
      return;
    }
    const next = [...exchanges, { id: genId(), from, day, month, year, status: "open", createdAt: Date.now() }];
    setExchanges(next);
    await safeSet(KEYS.exchanges(), next);
    showToast("🔄 Demande d'échange envoyée !");
    setSheetOpen(false);
  };

  const acceptExchange = async (id, acceptedBy) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex || ex.status !== "open") { showToast("Échange non disponible", "error"); await loadData(); return; }
    const nextEx   = exchanges.map(e => e.id === id ? { ...e, status: "accepted", acceptedBy } : e);
    const nextPlan = { ...planning, [ex.day]: acceptedBy };
    setExchanges(nextEx);
    setPlanning(nextPlan);
    await Promise.all([safeSet(KEYS.exchanges(), nextEx), safeSet(KEYS.plan(ex.year, ex.month), nextPlan)]);
    showToast(`✅ ${acceptedBy} prend le ${formatDateShort(ex.day, ex.month)} !`);
  };

  const cancelExchange = async (id) => {
    const next = exchanges.filter(e => e.id !== id);
    setExchanges(next);
    await safeSet(KEYS.exchanges(), next);
    showToast("Demande annulée", "info");
  };

  const saveTemplate = async (tpl) => {
    setTemplate(tpl);
    await safeSet(KEYS.template(), tpl);
  };

  const applyTemplate = async (overwrite) => {
    const total = getDaysInMonth(year, month);
    const next  = overwrite ? {} : { ...planning };
    for (let d = 1; d <= total; d++) {
      const wd = new Date(year, month, d).getDay();
      const idx = wd === 0 ? 6 : wd - 1;
      if (template[idx] && (overwrite || !next[d])) next[d] = template[idx];
    }
    setPlanning(next);
    await safeSet(KEYS.plan(year, month), next);
    showToast("✅ Modèle appliqué au mois !");
  };

  // ── Navigation mois ─────────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  // ═════════════════════════════════════════════════════════════
  //  RENDU — CALENDRIER
  // ═════════════════════════════════════════════════════════════

  const renderCalendar = () => {
    const today         = new Date();
    const isCurrMonth   = today.getFullYear() === year && today.getMonth() === month;
    const totalDays     = getDaysInMonth(year, month);
    const firstWd       = getFirstWeekday(year, month);
    const cells         = [];
    const plannedCount  = Object.keys(planning).length;

    for (let i = 0; i < firstWd; i++) cells.push(<div key={`e${i}`} />);

    for (let d = 1; d <= totalDays; d++) {
      const isToday     = isCurrMonth && d === today.getDate();
      const isPast      = isCurrMonth ? d < today.getDate() : (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth()));
      const assignee    = planning[d];
      const person      = assignee ? personFor(assignee) : null;
      const hasExchange = exchanges.some(e => e.day === d && e.month === month && e.year === year && e.status === "open");
      const hasIndispo  = (indispo[d] || []).length > 0;

      cells.push(
        <div
          key={d}
          role="button"
          tabIndex={0}
          aria-label={`${formatDateFull(d, month, year)}${assignee ? `, ${assignee}` : ", non assigné"}`}
          onClick={() => { setSelectedDay(d); setSheetOpen(true); }}
          onKeyDown={e => e.key === "Enter" && (setSelectedDay(d), setSheetOpen(true))}
          style={{
            aspectRatio: "1",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: isToday ? "#2D1B0E" : person ? "#FFFFFF" : "#F5EDE5",
            border: `1.5px solid ${isToday ? "transparent" : person ? person.color + "40" : "#EDE6DE"}`,
            opacity: isPast && !isToday ? 0.42 : 1,
            transition: "transform 0.1s, box-shadow 0.1s",
            gap: 2,
            minHeight: 44,
            padding: "3px 1px",
            boxShadow: person && !isToday ? `0 1px 4px ${person.color}20` : "none",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? "#FFF" : "#333", lineHeight: 1 }}>
            {d}
          </span>
          {person && (
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: isToday ? "#FFF" : person.color, flexShrink: 0 }} />
          )}
          {(hasExchange || hasIndispo) && (
            <div style={{ fontSize: 7, lineHeight: 1, display: "flex", gap: 1 }}>
              {hasExchange && <span>🔄</span>}
              {hasIndispo  && <span>⚠️</span>}
            </div>
          )}
        </div>
      );
    }

    return (
      <div>
        {/* Summary bar */}
        <div style={{ margin: "8px 12px 0", background: "#FFFFFF", borderRadius: 12, padding: "10px 14px", border: "1px solid #EDE6DE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>
            {plannedCount}/{totalDays} jours planifiés
          </span>
          {totalDays - plannedCount > 0
            ? <span style={{ fontSize: 13, color: "#C07000", fontWeight: 700 }}>⚠️ {totalDays - plannedCount} sans gardien</span>
            : <span style={{ fontSize: 13, color: "#2BA06A", fontWeight: 700 }}>✅ Tout couvert</span>
          }
        </div>

        {/* Grid header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: "8px 8px 0" }}>
          {WEEKDAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#BBB", padding: "4px 0", letterSpacing: 0.3 }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, padding: "0 8px 8px" }}>
          {cells}
        </div>

        {/* Légende */}
        <div style={{ padding: "0 12px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PEOPLE.map(p => {
            const count = Object.values(planning).filter(n => n === p.name).length;
            return (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 5, background: count > 0 ? p.bg : "#F5EDE5", borderRadius: 20, padding: "5px 10px", border: `1px solid ${count > 0 ? p.color + "50" : "#EDE6DE"}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: count > 0 ? p.color : "#999" }}>{p.name}</span>
                {count > 0 && <span style={{ fontSize: 11, color: p.color, fontWeight: 800 }}>{count}j</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDU — RÉPARTITION
  // ═════════════════════════════════════════════════════════════

  const renderStats = () => {
    const totalDays   = getDaysInMonth(year, month);
    const plannedDays = Object.keys(planning).length;
    const equitable   = 100 / PEOPLE.length;

    const stats = PEOPLE.map(p => {
      const count = Object.values(planning).filter(n => n === p.name).length;
      const pct   = plannedDays > 0 ? (count / plannedDays) * 100 : 0;
      return { ...p, count, pct, diff: pct - equitable };
    }).sort((a, b) => b.count - a.count);

    return (
      <div style={{ padding: "12px 12px 16px" }}>
        {/* Résumé */}
        <div style={{ background: plannedDays < totalDays ? "#FFFBF0" : "#F0FAF5", borderRadius: 14, padding: "12px 14px", marginBottom: 12, border: `1px solid ${plannedDays < totalDays ? "#F0D060" : "#90D8B0"}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#2D1B0E" }}>
            {plannedDays} jour{plannedDays > 1 ? "s" : ""} planifié{plannedDays > 1 ? "s" : ""} sur {totalDays}
          </div>
          <div style={{ fontSize: 13, color: plannedDays < totalDays ? "#B07800" : "#2BA06A", marginTop: 4, fontWeight: 600 }}>
            {plannedDays < totalDays ? `⚠️ ${totalDays - plannedDays} jour${totalDays - plannedDays > 1 ? "s" : ""} sans gardien` : "✅ Tous les jours sont couverts"}
          </div>
        </div>

        {stats.map(p => (
          <div key={p.name} style={{ background: "#FFFFFF", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: `1px solid ${p.count > 0 ? p.color + "30" : "#EDE6DE"}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: p.color }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: "#2D1B0E" }}>{p.name}</span>
                <span style={{ fontSize: 11, color: "#BBB", background: "#F5EDE5", borderRadius: 8, padding: "2px 6px" }}>{p.role}</span>
              </div>
              <div>
                <span style={{ fontSize: 22, fontWeight: 900, color: p.count > 0 ? p.color : "#CCC" }}>{p.count}</span>
                <span style={{ fontSize: 13, color: "#AAA" }}> j</span>
              </div>
            </div>

            <div style={{ height: 8, borderRadius: 4, background: "#F0EBE5", overflow: "hidden", margin: "8px 0 4px" }}>
              <div style={{ height: "100%", width: `${Math.min(p.pct, 100)}%`, background: p.color, borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#AAA" }}>{Math.round(p.pct)}% des jours planifiés</span>
              {p.count > 0 && Math.abs(p.diff) > 3 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: p.diff > 5 ? "#D93025" : "#2BA06A" }}>
                  {p.diff > 0 ? "+" : ""}{Math.round(p.diff)}% vs équitable
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDU — ÉCHANGES
  // ═════════════════════════════════════════════════════════════

  const renderExchanges = () => {
    const open = exchanges.filter(e => e.status === "open");

    if (open.length === 0) return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🤝</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#2D1B0E" }}>Aucun échange en cours</div>
        <div style={{ fontSize: 15, color: "#AAA", marginTop: 8, lineHeight: 1.5 }}>
          Appuyez sur un jour du calendrier puis "Proposer un échange" pour demander un remplaçant
        </div>
      </div>
    );

    return (
      <div style={{ padding: "12px 12px 16px" }}>
        {open.map(ex => {
          const p = personFor(ex.from);
          return (
            <div key={ex.id} style={{ background: "#FFFFFF", border: `1px solid ${p?.color || "#EDE6DE"}40`, borderRadius: 16, padding: "14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: p?.color }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: "#2D1B0E" }}>{ex.from}</span>
                <span style={{ fontSize: 14, color: "#666" }}>cherche un remplaçant</span>
              </div>
              <div style={{ background: "#F5EDE5", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 16, fontWeight: 600, color: "#444" }}>
                📅 {formatDateFull(ex.day, ex.month, ex.year)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#AAA", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Qui peut prendre ce jour ?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PEOPLE.filter(pe => pe.name !== ex.from).map(pe => (
                  <button
                    key={pe.name}
                    style={{ padding: "12px 8px", borderRadius: 12, border: `1.5px solid ${pe.color}50`, background: pe.bg, color: pe.color, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                    onClick={() => showConfirm(
                      `${pe.name} prend le ${ex.day} ${MONTHS_FR[ex.month]} à la place de ${ex.from} ?`,
                      () => acceptExchange(ex.id, pe.name)
                    )}
                  >
                    {pe.name}
                  </button>
                ))}
              </div>
              <button
                style={{ width: "100%", marginTop: 10, padding: "11px", borderRadius: 10, border: "1px solid #EEE", background: "#FFF5F5", color: "#D93025", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                onClick={() => showConfirm("Annuler cette demande d'échange ?", () => cancelExchange(ex.id))}
              >
                Annuler la demande
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDU — MODÈLE DE SEMAINE
  // ═════════════════════════════════════════════════════════════

  const renderTemplate = () => {
    const handleChange = async (idx, value) => {
      const next = { ...template };
      if (value) next[idx] = value; else delete next[idx];
      await saveTemplate(next);
    };

    return (
      <div style={{ padding: "12px 12px 16px" }}>
        <div style={{ background: "#FFF8F0", border: "1px solid #F0D8C0", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#2D1B0E", marginBottom: 6 }}>📅 Modèle de semaine</div>
          <div style={{ fontSize: 14, color: "#888", lineHeight: 1.6 }}>
            Définissez qui garde Maman chaque jour par défaut. Appliquez ensuite au mois pour remplir le planning automatiquement.
          </div>
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "4px 14px", border: "1px solid #EDE6DE", marginBottom: 14 }}>
          {WEEKDAYS_FULL.map((wd, idx) => {
            const assigned = template[idx];
            const p        = assigned ? personFor(assigned) : null;
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: idx < 6 ? "1px solid #F5EDE5" : "none" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#2D1B0E", width: 95, flexShrink: 0 }}>{wd}</span>
                <div style={{ flex: 1, position: "relative" }}>
                  {p && <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: p.color, pointerEvents: "none", zIndex: 1 }} />}
                  <select
                    value={assigned || ""}
                    onChange={e => handleChange(idx, e.target.value)}
                    aria-label={`Gardien du ${wd}`}
                    style={{
                      width: "100%",
                      padding: `9px 12px 9px ${p ? "28px" : "12px"}`,
                      borderRadius: 10,
                      border: `2px solid ${p ? p.color + "60" : "#E0D8D0"}`,
                      background: p ? p.bg : "#F5EDE5",
                      fontSize: 15,
                      fontWeight: 600,
                      color: p ? p.color : "#888",
                      fontFamily: "inherit",
                      appearance: "none",
                      WebkitAppearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— Personne —</option>
                    {PEOPLE.map(pe => <option key={pe.name} value={pe.name}>{pe.name}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "14px", border: "1px solid #EDE6DE" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#2D1B0E", marginBottom: 12 }}>
            Appliquer à {MONTHS_FR[month]} {year}
          </div>
          <button
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#2D1B0E", color: "#FFF", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            onClick={() => showConfirm(
              `Compléter les jours vides de ${MONTHS_FR[month]} avec le modèle ? Les assignations existantes sont conservées.`,
              () => applyTemplate(false)
            )}
          >
            Remplir les jours vides
          </button>
          <button
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#FFF0F0", color: "#D93025", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}
            onClick={() => showConfirm(
              `Remplacer TOUT le planning de ${MONTHS_FR[month]} par le modèle ? Les assignations existantes seront perdues.`,
              () => applyTemplate(true)
            )}
          >
            Tout remplacer par le modèle
          </button>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  BOTTOM SHEET (Modal jour)
  // ═════════════════════════════════════════════════════════════

  const renderSheet = () => {
    if (selectedDay === null) return null;
    const assignee    = planning[selectedDay];
    const dayIndispo  = indispo[selectedDay] || [];
    const p           = assignee ? personFor(assignee) : null;
    const hasExchange = exchanges.some(e => e.day === selectedDay && e.month === month && e.year === year && e.status === "open");

    return (
      <>
        {/* Overlay */}
        <div
          onClick={() => setSheetOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, opacity: sheetOpen ? 1 : 0, pointerEvents: sheetOpen ? "all" : "none", transition: "opacity 0.25s" }}
        />

        {/* Sheet */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Planning du ${formatDateFull(selectedDay, month, year)}`}
          style={{
            position: "fixed", bottom: 0, left: "50%",
            transform: `translateX(-50%) translateY(${sheetOpen ? "0" : "110%"})`,
            width: "100%", maxWidth: 480, background: "#FFFFFF",
            borderRadius: "22px 22px 0 0", zIndex: 101,
            transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
            maxHeight: "88vh", overflowY: "auto",
          }}
        >
          {/* Handle */}
          <div style={{ width: 40, height: 4, background: "#DDD", borderRadius: 2, margin: "12px auto 0" }} />

          {/* Header */}
          <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: "#2D1B0E" }}>{formatDateFull(selectedDay, month, year)}</span>
            <button
              onClick={() => setSheetOpen(false)}
              aria-label="Fermer"
              style={{ background: "#F0EBE5", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}
            >✕</button>
          </div>

          {/* Assignation actuelle */}
          <div style={{ padding: "14px 16px 0" }}>
            {assignee && p ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: p.bg, borderRadius: 12, padding: "12px 14px", border: `2px solid ${p.color}` }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: p.color }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: "#2D1B0E", flex: 1 }}>Gardien·ne : {assignee}</span>
                {hasExchange && <span style={{ fontSize: 12, color: "#B08A10", fontWeight: 700, background: "#F8F3E8", borderRadius: 8, padding: "3px 8px" }}>🔄 Échange ouvert</span>}
              </div>
            ) : (
              <div style={{ background: "#F5EDE5", borderRadius: 12, padding: "12px 14px", fontSize: 15, color: "#AAA", fontWeight: 600 }}>
                Personne n'est assigné pour ce jour
              </div>
            )}
          </div>

          {/* Qui garde ? */}
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#BBB", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Qui garde Maman ce jour ?</div>
            {PEOPLE.map(pe => (
              <button
                key={pe.name}
                onClick={() => assignDay(selectedDay, pe.name)}
                aria-pressed={assignee === pe.name}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "13px 14px", borderRadius: 12, marginBottom: 6,
                  border: `2px solid ${assignee === pe.name ? pe.color : "transparent"}`,
                  background: assignee === pe.name ? pe.bg : "#F5EDE5",
                  cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: pe.color, flexShrink: 0 }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: "#2D1B0E", flex: 1 }}>{pe.name}</span>
                <span style={{ fontSize: 12, color: "#BBB" }}>{pe.role}</span>
                {assignee === pe.name && <span style={{ color: pe.color, fontWeight: 800 }}>✓</span>}
              </button>
            ))}
          </div>

          {/* Indisponibilités */}
          <div style={{ padding: "14px 16px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#BBB", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Indisponibilités</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {PEOPLE.map(pe => {
                const active = dayIndispo.includes(pe.name);
                return (
                  <button
                    key={pe.name}
                    onClick={() => toggleIndispo(selectedDay, pe.name)}
                    aria-pressed={active}
                    style={{ padding: "9px 13px", borderRadius: 20, border: `1.5px solid ${active ? pe.color : "#DDD"}`, background: active ? pe.color + "20" : "#F5EDE5", color: active ? pe.color : "#777", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {active ? "✕ " : ""}{pe.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "14px 16px 0" }}>
            {assignee && !hasExchange && (
              <button
                onClick={() => proposeExchange(selectedDay)}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#F0EBE5", color: "#444", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}
              >
                🔄 Proposer un échange
              </button>
            )}
            {assignee && (
              <button
                onClick={() => showConfirm(
                  `Effacer l'assignation de ${assignee} du ${formatDateFull(selectedDay, month, year)} ?`,
                  () => { clearDay(selectedDay); setSheetOpen(false); }
                )}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#FFF0F0", color: "#D93025", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                🗑 Effacer l'assignation
              </button>
            )}
          </div>

          <div style={{ height: 32 }} />
        </div>
      </>
    );
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDER PRINCIPAL
  // ═════════════════════════════════════════════════════════════

  const TABS = [
    { id: "calendar",  label: "Calendrier",  icon: "📅" },
    { id: "stats",     label: "Répartition", icon: "📊" },
    { id: "exchanges", label: "Échanges",    icon: "🔄" },
    { id: "template",  label: "Modèle",      icon: "⚙️" },
  ];

  const openExCount = exchanges.filter(e => e.status === "open").length;
  const showMonthNav = view !== "exchanges";

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", background: "#FFF8F3", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #EDE6DE", padding: "12px 16px 10px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#2D1B0E", margin: 0 }}>🌸 Planning Maman</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {syncing && <span style={{ fontSize: 18, color: "#CCC", animation: "spin 1s linear infinite" }}>⟳</span>}
            {lastSync && <span style={{ fontSize: 12, color: "#BBB" }}>{lastSync.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
        {showMonthNav && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <button onClick={prevMonth} aria-label="Mois précédent" style={{ background: "#F5EDE5", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#555", fontFamily: "inherit" }}>‹</button>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#2D1B0E" }}>{MONTHS_FR[month]} {year}</span>
            <button onClick={nextMonth} aria-label="Mois suivant" style={{ background: "#F5EDE5", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#555", fontFamily: "inherit" }}>›</button>
          </div>
        )}
      </div>

      {/* ── Contenu ── */}
      {view === "calendar"  && renderCalendar()}
      {view === "stats"     && renderStats()}
      {view === "exchanges" && renderExchanges()}
      {view === "template"  && renderTemplate()}

      {/* ── Bottom Sheet ── */}
      {renderSheet()}

      {/* ── Toast ── */}
      {toast && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            background: toast.type === "error" ? "#D93025" : toast.type === "info" ? "#555" : "#2BA06A",
            color: "#FFF", padding: "13px 22px", borderRadius: 14,
            fontSize: 15, fontWeight: 700, zIndex: 999,
            whiteSpace: "nowrap", boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            fontFamily: "inherit",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Dialog de confirmation ── */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div style={{ background: "#FFFFFF", borderRadius: 22, padding: 24, width: "100%", maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#2D1B0E", lineHeight: 1.5, marginBottom: 22 }}>{confirm.msg}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#F0EBE5", color: "#444", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={() => { confirm.onConfirm(); setConfirm(null); }} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#D93025", color: "#FFF", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation bas ── */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#FFFFFF", borderTop: "1px solid #EDE6DE", display: "flex", zIndex: 20 }}>
        {TABS.map(tab => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px 14px", cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", gap: 3, position: "relative" }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, position: "relative" }}>
                {tab.icon}
                {tab.id === "exchanges" && openExCount > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -8, background: "#D93025", color: "#FFF", borderRadius: "50%", width: 17, height: 17, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontFamily: "inherit" }}>
                    {openExCount}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: active ? 800 : 500, color: active ? "#E07A4F" : "#BBB" }}>{tab.label}</span>
              {active && <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 3, background: "#E07A4F", borderRadius: "2px 2px 0 0" }} />}
            </button>
          );
        })}
      </nav>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}
