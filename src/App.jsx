import React, { useState, useEffect, useMemo, Component, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, addDoc, deleteDoc, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { Loader2, Zap, Target, ScrollText, User, X, Dumbbell, AlertTriangle, Wifi, WifiOff, Utensils, Trash2, TrendingUp, ChevronRight, Pencil, Camera, Check, LogOut, Lock, Mail, Sparkles, Mic, ChartColumn, Settings, Globe, Plus, ChevronDown, ChevronUp } from 'lucide-react';

// --- TRANSLATIONS ---
const RESOURCES = {
  en: {
    hello: "Hello",
    dash: "Dash",
    diary: "Diary",
    coach: "Coach",
    current: "Current",
    goal: "Goal",
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fats: "Fats",
    remaining: "Remaining",
    consumed: "Consumed",
    weekly: "Weekly Trends",
    weightTrend: "Weight Trend",
    recent: "Recent",
    noLogs: "No logs today.",
    viewAll: "View All",
    searchPlaceholder: "Search food...",
    quantity: "Quantity",
    confirm: "Add Food",
    saveProfile: "Save Profile",
    signOut: "Sign Out",
    setupReq: "App Setup Required",
    saveRestart: "Save & Restart",
    clear: "Clear",
    guest: "Continue as Guest",
    signIn: "Sign In",
    signUp: "Sign Up",
    emailPlaceholder: "Email",
    passPlaceholder: "Password",
    aiPrompt: "Respond in English. Keep it short.",
    foodPrompt: "Name should be in English.",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snacks: "Snacks",
    addFood: "Add Food",
    total: "Total"
  },
  pa: {
    hello: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
    dash: "ਡੈਸ਼ਬੋਰਡ",
    diary: "ਡਾਇਰੀ",
    coach: "ਕੋਚ",
    current: "ਮੌਜੂਦਾ",
    goal: "ਟੀਚਾ",
    calories: "ਕੈਲੋਰੀ",
    protein: "ਪ੍ਰੋਟੀਨ",
    carbs: "ਕਾਰਬੋਹਾਈਡਰੇਟ",
    fats: "ਚਰਬੀ",
    remaining: "ਬਾਕੀ",
    consumed: "ਖਾਧਾ",
    weekly: "ਹਫਤਾਵਾਰੀ ਰੁਝਾਨ",
    weightTrend: "ਭਾਰ ਦਾ ਰੁਝਾਨ",
    recent: "ਹਾਲੀਆ",
    noLogs: "ਕੋਈ ਲੌਗ ਨਹੀਂ",
    viewAll: "ਸਭ ਦੇਖੋ",
    searchPlaceholder: "ਭੋਜਨ ਲੱਭੋ...",
    quantity: "ਮਾਤਰਾ",
    confirm: "ਸ਼ਾਮਲ ਕਰੋ",
    saveProfile: "ਸੰਭਾਲੋ",
    signOut: "ਬਾਹਰ ਨਿਕਲੋ",
    setupReq: "ਸੈੱਟਅੱਪ ਲੋੜੀਂਦਾ ਹੈ",
    saveRestart: "ਸੰਭਾਲੋ",
    clear: "ਸਾਫ਼",
    guest: "ਮਹਿਮਾਨ",
    signIn: "ਦਾਖਲ ਹੋਵੋ",
    signUp: "ਰਜਿਸਟਰ ਕਰੋ",
    emailPlaceholder: "ਈਮੇਲ",
    passPlaceholder: "ਪਾਸਵਰਡ",
    aiPrompt: "Respond in Punjabi. Keep it short.",
    foodPrompt: "Name in Punjabi if possible.",
    breakfast: "ਨਾਸ਼ਤਾ",
    lunch: "ਦੁਪਹਿਰ ਦਾ ਖਾਣਾ",
    dinner: "ਰਾਤ ਦਾ ਖਾਣਾ",
    snacks: "ਸਨੈਕਸ",
    addFood: "ਭੋਜਨ ਸ਼ਾਮਲ ਕਰੋ",
    total: "ਕੁੱਲ"
  }
};

// --- Safety Utilities ---
const safeStorage = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch (e) { } },
  removeItem: (key) => { try { localStorage.removeItem(key); } catch (e) { } }
};

const safeDate = (val) => {
  try {
    if (!val) return new Date();
    if (val.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (e) { return new Date(); }
};

// Use this helper for strict date comparison (YYYY-MM-DD) to fix chart bugs
const getDateString = (dateObj) => {
    const d = safeDate(dateObj);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --- Error Boundary ---
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 text-center"><div className="max-w-xs"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4"/><h1 className="text-lg font-bold text-red-900 mb-2">Something went wrong</h1><button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-2 rounded-xl text-sm font-bold">Restart</button></div></div>;
    return this.props.children;
  }
}

// --- Configuration ---
// @ts-ignore
const isPreviewEnv = typeof __firebase_config !== 'undefined';

const getKey = (keyName) => {
    const stored = safeStorage.getItem(keyName);
    if (stored) return stored;
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[keyName]) {
            return import.meta.env[keyName];
        }
    } catch (e) { }
    return "";
};

const localFirebaseConfig = {
  apiKey: getKey("VITE_FIREBASE_API_KEY"),
  authDomain: "smartfit-app-bb195.firebaseapp.com",
  projectId: "smartfit-app-bb195",
  storageBucket: "smartfit-app-bb195.firebasestorage.app",
  messagingSenderId: "280213405028",
  appId: "1:280213405028:web:8176ffe7082ee1c52d0e71",
  measurementId: "G-69J3B5HRPJ"
};

const localGeminiKey = getKey("VITE_GEMINI_API_KEY");

// @ts-ignore
const firebaseConfig = isPreviewEnv ? JSON.parse(__firebase_config) : localFirebaseConfig;
// @ts-ignore
const GEMINI_API_KEY = isPreviewEnv ? (typeof apiKey !== 'undefined' ? apiKey : "") : localGeminiKey;

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

// --- Setup Screen ---
const SetupScreen = () => {
    const [fbKey, setFbKey] = useState(safeStorage.getItem("VITE_FIREBASE_API_KEY") || "");
    const [gemKey, setGemKey] = useState(safeStorage.getItem("VITE_GEMINI_API_KEY") || "");
    const handleSave = () => { if(fbKey) safeStorage.setItem("VITE_FIREBASE_API_KEY", fbKey); if(gemKey) safeStorage.setItem("VITE_GEMINI_API_KEY", gemKey); window.location.reload(); };
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans"><div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 w-full max-w-md"><h1 className="text-xl font-bold mb-4 flex items-center gap-2"><Lock className="w-5 h-5"/> Setup Keys</h1><input value={fbKey} onChange={e=>setFbKey(e.target.value)} placeholder="Firebase Key" className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 mb-3 text-sm" /><input value={gemKey} onChange={e=>setGemKey(e.target.value)} placeholder="Gemini Key" className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 mb-4 text-sm" /><button onClick={handleSave} className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl">Save</button></div></div>;
};

// --- Helpers ---
const KG_TO_LBS = 2.20462;
const toDisplayWeight = (kg, unit) => (!kg || isNaN(kg)) ? 0 : (unit === 'lbs' ? (kg * KG_TO_LBS).toFixed(1) : kg.toFixed(1));
const toStorageWeight = (value, unit) => (!value || isNaN(parseFloat(value))) ? 0 : (unit === 'lbs' ? parseFloat(value) / KG_TO_LBS : parseFloat(value));
const calculateTargets = (profile) => {
  let base = 2000;
  if (profile && profile.currentWeight > 0) {
    const w = parseFloat(profile.currentWeight) || 70;
    const act = { low: 1.2, moderate: 1.55, high: 1.9 }[profile.activityLevel] || 1.2;
    const age = parseInt(profile?.age, 10) || 30; 
    let tdee = (10 * w + 6.25 * 170 - 5 * age + 5) * act; 
    const goal = parseFloat(profile.goalWeight) || w;
    if (goal < w) tdee -= 500; else if (goal > w) tdee += 300; 
    base = Math.max(1200, Math.round(tdee));
  }
  const cal = (profile?.autoCalcCalories !== false && parseInt(profile?.targetCalories) > 0) ? parseInt(profile.targetCalories) : base;
  return { calories: cal, protein: Math.round((cal * 0.3) / 4), fats: Math.round((cal * 0.35) / 9), carbs: Math.round((cal * 0.35) / 4) };
};

// --- Data Service ---
const useFitnessData = () => {
  const [status, setStatus] = useState('loading'); 
  const [userProfile, setUserProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [lang, setLang] = useState(safeStorage.getItem('smartfit_lang') || 'en');
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  const t = (key) => RESOURCES[lang][key] || key;
  const toggleLanguage = () => { const newLang = lang === 'en' ? 'pa' : 'en'; setLang(newLang); safeStorage.setItem('smartfit_lang', newLang); };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!firebaseConfig.apiKey) { if(mounted) setStatus('missing_keys'); return; }
      try {
        const app = initializeApp(firebaseConfig);
        const fauth = getAuth(app);
        const firestore = getFirestore(app);
        if (mounted) { setDb(firestore); setAuth(fauth); }
        onAuthStateChanged(fauth, async (user) => {
          if (!mounted) return;
          if (user) { setUserId(user.uid); setStatus('ready'); } else { setUserId(null); setStatus('auth'); }
        });
      } catch (e) { 
        if (mounted) { setStatus('ready'); setUserId('local'); } 
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!db || !userId) return;
    const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
    
    const unsubP = onSnapshot(doc(db, `${path}/data/profile`), d => d.exists() ? setUserProfile(d.data()) : setUserProfile(null));
    const unsubL = onSnapshot(query(collection(db, `${path}/logs`)), s => {
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(l); // We do filtering/sorting in UI now to handle dates better
    });
    return () => { unsubP(); unsubL(); };
  }, [db, userId]);

  const handleAuth = async (isLogin, e, p) => { if (!auth) return; try { if (isLogin) await signInWithEmailAndPassword(auth, e, p); else await createUserWithEmailAndPassword(auth, e, p); } catch(err) { throw err; } };
  const handleGuest = async () => { if (auth) await signInAnonymously(auth); };
  const handleLogout = async () => { if (auth) await signOut(auth); setUserProfile(null); setLogs([]); };

  const saveProfileData = async (newProfile) => {
    // Mark onboarding as complete
    const profileWithFlag = { ...newProfile, onboardingCompleted: true };
    setUserProfile(profileWithFlag);
    if (db && userId) {
      const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
      await setDoc(doc(db, `${path}/data/profile`), profileWithFlag, { merge: true });
    }
  };

  const addLogEntry = async (entry) => {
    const newEntry = { ...entry, id: Date.now().toString() };
    if (db && userId) {
      const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
      await addDoc(collection(db, `${path}/logs`), entry);
    } else { setLogs([...logs, newEntry]); }
  };

  const deleteLogEntry = async (id) => {
    if (db && userId) {
        const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
        await deleteDoc(doc(db, `${path}/logs/${id}`));
    } else { setLogs(logs.filter(l => l.id !== id)); }
  };

  return { status, userProfile, logs, lang, t, toggleLanguage, saveProfileData, addLogEntry, deleteLogEntry, handleAuth, handleGuest, handleLogout, db, userId };
};

// --- Auth Screen ---
const AuthScreen = ({ onAuth, onGuest, t }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try { await onAuth(isLogin, email, pass); } catch (e) { setError(e.code === 'auth/invalid-credential' ? "Invalid credentials" : "Auth Error"); } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/20 to-slate-900 pointer-events-none"/>
            <div className="w-full max-w-sm relative z-10">
                <div className="text-center mb-8"><Dumbbell className="w-12 h-12 text-emerald-400 mx-auto mb-4"/><h1 className="text-3xl font-black">Smart Fit</h1></div>
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-6 rounded-3xl">
                    <div className="flex bg-slate-900/50 p-1 rounded-xl mb-6"><button onClick={()=>setIsLogin(true)} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${isLogin?'bg-slate-700 text-white':'text-slate-400'}`}>{t('signIn')}</button><button onClick={()=>setIsLogin(false)} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!isLogin?'bg-slate-700 text-white':'text-slate-400'}`}>{t('signUp')}</button></div>
                    <form onSubmit={submit} className="space-y-4">
                        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none focus:border-emerald-500" placeholder={t('emailPlaceholder')} required />
                        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none focus:border-emerald-500" placeholder={t('passPlaceholder')} required />
                        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                        <button disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-600 py-3 rounded-xl font-bold transition-all">{loading ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : (isLogin ? t('signIn') : t('signUp'))}</button>
                    </form>
                </div>
                <button onClick={onGuest} disabled={loading} className="w-full mt-4 text-slate-400 text-sm hover:text-white transition-colors">{t('guest')}</button>
            </div>
        </div>
    );
};

// --- Chat Component (Persistent) ---
const AICoach = ({ userProfile, lang, t, db, userId }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]); // Local state for immediate UI
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Load chat history
  useEffect(() => {
      if (!db || !userId) return;
      const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
      const q = query(collection(db, `${path}/chatHistory`), orderBy('createdAt', 'asc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          setMessages(snapshot.docs.map(d => d.data()));
      });
      return () => unsubscribe();
  }, [db, userId]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    const userMsg = { text: query, role: 'user', createdAt: serverTimestamp() };
    setQuery('');
    setLoading(true);

    // Optimistically add user message? No, wait for Firestore listener to add it.
    // Actually, saving to Firestore first is better.
    const path = isPreviewEnv ? `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default'}/users/${userId}` : `users/${userId}`;
    if (db && userId) {
        await addDoc(collection(db, `${path}/chatHistory`), userMsg);
    }

    const context = `Profile: ${userProfile?.currentWeight}kg, Goal: ${userProfile?.goalWeight}kg. Lang: ${lang}`;
    const fullPrompt = `You are FitBot. Context: ${context}. User: "${userMsg.text}". ${RESOURCES[lang].aiPrompt}`;

    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) });
      const data = await res.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error.";
      
      if (db && userId) {
          await addDoc(collection(db, `${path}/chatHistory`), { text: aiText, role: 'ai', createdAt: serverTimestamp() });
      }
    } catch (e) { 
        if (db && userId) await addDoc(collection(db, `${path}/chatHistory`), { text: "Connection error.", role: 'ai', createdAt: serverTimestamp() });
    } 
    finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col p-4 pb-24 bg-slate-50">
      <div className="flex items-center gap-3 mb-4"><div className="p-2 bg-yellow-100 rounded-xl"><Sparkles className="w-5 h-5 text-yellow-600" /></div><h1 className="text-xl font-bold text-slate-900">{t('coach')}</h1></div>
      <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.length === 0 && <div className="text-center text-slate-400 text-sm mt-10">Start a conversation with FitBot!</div>}
        {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                    {msg.role === 'ai' ? <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: msg.text?.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} /> : msg.text}
                </div>
            </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-slate-200 text-slate-500 px-4 py-2 rounded-full text-xs animate-pulse">Thinking...</div></div>}
        <div ref={scrollRef} />
      </div>
      <div className="relative shrink-0"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} placeholder="Ask FitBot..." className="w-full p-4 pr-12 bg-white border border-slate-200 rounded-full shadow-sm outline-none focus:ring-2 ring-emerald-500 transition-all text-sm" /><button onClick={handleAsk} disabled={loading||!query} className="absolute right-2 top-2 p-2 bg-emerald-500 text-white rounded-full shadow-md disabled:opacity-50"><ChevronRight className="w-5 h-5" /></button></div>
    </div>
  );
};

// --- Diary Component (Meal Based) ---
const MealSection = ({ title, mealLogs, onAdd, onDelete, t }) => {
    const totalCals = mealLogs.reduce((acc, l) => acc + (l.nutrition?.calories || 0), 0);
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
            <div className="p-4 bg-slate-50/50 flex justify-between items-center border-b border-slate-100">
                <h3 className="font-bold text-slate-700">{title}</h3>
                <span className="text-xs font-bold text-emerald-600">{totalCals} kcal</span>
            </div>
            <div>
                {mealLogs.length === 0 && <div className="p-6 text-center text-slate-300 text-xs italic">No food logged</div>}
                {mealLogs.map(log => (
                    <div key={log.id} className="p-3 flex justify-between items-center border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <div>
                            <p className="text-sm font-medium text-slate-800">{log.description}</p>
                            <p className="text-[10px] text-slate-400">{log.nutrition?.calories} cal • {log.nutrition?.protein}p • {log.nutrition?.carbs}c • {log.nutrition?.fats}f</p>
                        </div>
                        <button onClick={() => onDelete(log.id)} className="text-slate-300 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
                    </div>
                ))}
            </div>
            <button onClick={onAdd} className="w-full py-3 text-xs font-bold text-indigo-500 hover:bg-indigo-50 transition-colors flex items-center justify-center border-t border-slate-100">
                <Plus className="w-3 h-3 mr-1"/> {t('addFood')}
            </button>
        </div>
    );
};

const DiaryTab = ({ logs, addLogEntry, deleteLogEntry, t, lang }) => {
    const [addingMeal, setAddingMeal] = useState(null); // 'breakfast', 'lunch', etc.
    const [inputVal, setInputVal] = useState('');
    const [loading, setLoading] = useState(false);
    const [foodOptions, setFoodOptions] = useState(null);
    const [selectedFood, setSelectedFood] = useState(null);
    const [quantity, setQuantity] = useState(1);

    // Filter logs for TODAY only
    const todayLogs = useMemo(() => {
        const todayStr = getDateString(new Date());
        return logs.filter(l => l.type === 'food' && getDateString(l.date) === todayStr);
    }, [logs]);

    const handleSearch = async () => {
        if (!inputVal) return;
        setLoading(true); setFoodOptions(null);
        try {
            const prompt = `Identify 3-5 distinct matches for food: "${inputVal}". Return JSON array: [{name, calories, protein, carbs, fats}]. ${RESOURCES[lang].foodPrompt}`;
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }) });
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) setFoodOptions(JSON.parse(text));
        } catch(e) { alert("Search failed"); } finally { setLoading(false); }
    };

    const handleAdd = () => {
        if (!selectedFood || !addingMeal) return;
        const m = parseFloat(quantity) || 1;
        const nutrition = {
            calories: Math.round(selectedFood.calories * m),
            protein: Math.round(selectedFood.protein * m),
            carbs: Math.round(selectedFood.carbs * m),
            fats: Math.round(selectedFood.fats * m),
        };
        const desc = m === 1 ? selectedFood.name : `${selectedFood.name} (x${m})`;
        addLogEntry({ type: 'food', meal: addingMeal, description: desc, nutrition, date: new Date().toISOString() });
        setAddingMeal(null); setFoodOptions(null); setSelectedFood(null); setInputVal(''); setQuantity(1);
    };

    // Modal for adding food
    if (addingMeal) return (
        <div className="p-5 pb-24 h-full flex flex-col bg-white">
            <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setAddingMeal(null)} className="p-2 bg-slate-100 rounded-full"><ChevronDown className="w-5 h-5 rotate-90"/></button>
                <h2 className="text-xl font-bold capitalize">{t(addingMeal)}</h2>
            </div>
            
            {!selectedFood ? (
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <input value={inputVal} onChange={e=>setInputVal(e.target.value)} placeholder={t('searchPlaceholder')} className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:border-emerald-500" />
                        <button onClick={handleSearch} disabled={loading} className="bg-emerald-500 text-white px-4 rounded-xl font-bold">{loading ? <Loader2 className="animate-spin"/> : 'Go'}</button>
                    </div>
                    <div className="space-y-2">
                        {foodOptions?.map((f, i) => (
                            <button key={i} onClick={() => setSelectedFood(f)} className="w-full text-left p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-emerald-500 transition-colors">
                                <div className="font-bold text-slate-800">{f.name}</div>
                                <div className="text-xs text-slate-500">{f.calories} cal</div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                        <h3 className="text-2xl font-bold text-emerald-900 mb-1">{selectedFood.name}</h3>
                        <p className="text-emerald-600 text-sm font-medium">{Math.round(selectedFood.calories * quantity)} kcal</p>
                    </div>
                    <div className="flex items-center justify-center gap-4 bg-slate-50 p-4 rounded-2xl">
                        <span className="font-bold text-slate-500 text-sm">Servings:</span>
                        <input type="number" step="0.5" value={quantity} onChange={e=>setQuantity(e.target.value)} className="w-20 text-center p-2 rounded-xl border border-slate-200 font-bold text-lg outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={handleAdd} className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200">Add to Diary</button>
                    <button onClick={() => setSelectedFood(null)} className="w-full py-3 text-slate-400 font-bold">Back</button>
                </div>
            )}
        </div>
    );

    return (
        <div className="p-5 pb-24 space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center"><div className="p-2 bg-purple-100 rounded-xl mr-3"><Utensils className="w-6 h-6 text-purple-600" /></div>{t('diary')}</h1>
            <MealSection title={t('breakfast')} mealLogs={todayLogs.filter(l => l.meal === 'breakfast')} onAdd={() => setAddingMeal('breakfast')} onDelete={deleteLogEntry} t={t} />
            <MealSection title={t('lunch')} mealLogs={todayLogs.filter(l => l.meal === 'lunch')} onAdd={() => setAddingMeal('lunch')} onDelete={deleteLogEntry} t={t} />
            <MealSection title={t('dinner')} mealLogs={todayLogs.filter(l => l.meal === 'dinner')} onAdd={() => setAddingMeal('dinner')} onDelete={deleteLogEntry} t={t} />
            <MealSection title={t('snacks')} mealLogs={todayLogs.filter(l => l.meal === 'snacks')} onAdd={() => setAddingMeal('snacks')} onDelete={deleteLogEntry} t={t} />
        </div>
    );
};

// --- Stats Component ---
const StatsWidget = ({ logs, targets, t }) => {
    // Filter for TODAY using robust date string comparison
    const todayStr = getDateString(new Date());
    const todayLogs = logs.filter(l => l.type === 'food' && getDateString(l.date) === todayStr);
    
    const totals = todayLogs.reduce((acc, l) => ({
        cals: acc.cals + (l.nutrition?.calories || 0),
        prot: acc.prot + (l.nutrition?.protein || 0),
        carbs: acc.carbs + (l.nutrition?.carbs || 0),
        fats: acc.fats + (l.nutrition?.fats || 0),
    }), { cals: 0, prot: 0, carbs: 0, fats: 0 });

    const pct = Math.min((totals.cals / targets.calories) * 100, 100);

    return (
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -translate-y-10 translate-x-10"></div>
            <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                <div><span className="text-xs text-slate-400 block mb-1">{t('remaining')}</span><span className="text-3xl font-black">{Math.max(0, targets.calories - totals.cals)}</span></div>
                <div className="text-right"><span className="text-xs text-emerald-400 block mb-1">{t('consumed')}</span><span className="text-3xl font-black text-emerald-400">{totals.cals}</span></div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden relative z-10"><div style={{width: `${pct}%`}} className="h-full bg-emerald-500 rounded-full transition-all duration-1000"></div></div>
            <div className="flex justify-between text-xs font-medium text-slate-400 relative z-10">
                <span>{t('protein')}: <span className="text-white">{totals.prot}g</span></span>
                <span>{t('carbs')}: <span className="text-white">{totals.carbs}g</span></span>
                <span>{t('fats')}: <span className="text-white">{totals.fats}g</span></span>
            </div>
        </div>
    );
};

const WeeklyStats = ({ logs, t }) => {
  const [metric, setMetric] = useState('calories');
  const weeklyData = useMemo(() => {
    const data = []; const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const dStr = getDateString(d);
        const dayLogs = logs.filter(l => l.type === 'food' && getDateString(l.date) === dStr);
        data.push({ label: d.toLocaleDateString('en-US', { weekday: 'narrow' }), val: dayLogs.reduce((acc, l) => acc + (l.nutrition?.[metric] || 0), 0), isToday: dStr === getDateString(new Date()) });
    }
    return data;
  }, [logs, metric]);
  const max = Math.max(...weeklyData.map(d => d.val), 100);

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-6">
        <div className="flex justify-between mb-4 items-center">
             <div className="flex items-center gap-2"><div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><ChartColumn className="w-4 h-4"/></div><h3 className="text-xs font-bold uppercase text-slate-400">{t('weekly')}</h3></div>
             <div className="flex bg-slate-100 p-1 rounded-lg"><button onClick={()=>setMetric('calories')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${metric==='calories'?'bg-white shadow-sm':''}`}>Cal</button><button onClick={()=>setMetric('protein')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${metric==='protein'?'bg-white shadow-sm':''}`}>Prot</button></div>
        </div>
        <div className="h-32 flex items-end justify-between gap-2 px-2">
            {weeklyData.map((d, i) => (
                <div key={i} className="flex flex-col items-center flex-1 gap-1">
                    <div className="w-full bg-slate-100 rounded-t-lg h-full flex items-end overflow-hidden relative group">
                        <div style={{height: `${(d.val/max)*100}%`}} className={`w-full transition-all duration-500 ${d.isToday ? 'bg-emerald-500' : 'bg-indigo-300'} rounded-t-lg`}/>
                    </div>
                    <span className={`text-[10px] font-bold ${d.isToday ? 'text-slate-900' : 'text-slate-400'}`}>{d.label}</span>
                </div>
            ))}
        </div>
    </div>
  );
};

// --- Main App ---
const SmartFitContent = () => {
  const { status, userProfile, logs, lang, t, toggleLanguage, saveProfileData, addLogEntry, deleteLogEntry, handleAuth, handleGuest, handleLogout, db, userId } = useFitnessData();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showProfileModal, setShowProfileModal] = useState(false);

  // KEY FIX: Only show onboarding if profile is totally empty (new user)
  useEffect(() => {
    if (status === 'ready' && userProfile && !userProfile.onboardingCompleted) {
        setShowProfileModal(true);
    }
  }, [status, userProfile]);

  if (status === 'missing_keys' || (!GEMINI_API_KEY && !isPreviewEnv)) return <SetupScreen />;
  if (status === 'loading') return <div className="flex justify-center items-center h-screen bg-slate-50"><Loader2 className="animate-spin text-emerald-500 w-10 h-10" /></div>;
  if (status === 'auth') return <AuthScreen onAuth={handleAuth} onGuest={handleGuest} t={t} />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 max-w-md mx-auto shadow-2xl relative flex flex-col overflow-hidden">
        <div className="w-full py-1 px-4 text-[10px] font-bold text-center text-white bg-emerald-500 shadow-sm z-20 flex justify-center items-center gap-2"><Wifi className="w-3 h-3" /> ONLINE</div>

        <div className="flex-grow overflow-y-auto overflow-x-hidden scrollbar-hide">
          {activeTab === 'dashboard' && (
              <div className="p-5 animate-fade-in">
                  <div className="flex justify-between items-center mb-6">
                    <div><h1 className="text-3xl font-extrabold text-slate-900">{t('hello')},</h1><h2 className="text-xl text-emerald-600 font-bold">{userProfile?.name || 'Friend'}</h2></div>
                    <button onClick={() => setShowProfileModal(true)} className="w-10 h-10 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-emerald-600"><User className="w-5 h-5" /></button>
                  </div>
                  <StatsWidget logs={logs} targets={calculateTargets(userProfile)} t={t} />
                  <WeeklyStats logs={logs} t={t} />
              </div>
          )}
          {activeTab === 'diary' && <DiaryTab logs={logs} addLogEntry={addLogEntry} deleteLogEntry={deleteLogEntry} t={t} lang={lang} />}
          {activeTab === 'coach' && <AICoach userProfile={userProfile} lang={lang} t={t} db={db} userId={userId} />}
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto">
          <div className="absolute inset-0 bg-white/95 backdrop-blur-lg border-t border-slate-200"></div>
          <div className="relative flex justify-around items-center h-20 pb-2">
            <NavButton icon={User} label={t('dash')} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <div className="relative -top-5"><button onClick={() => setActiveTab('diary')} className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg shadow-emerald-200 transition-all transform active:scale-95 ${activeTab === 'diary' ? 'bg-emerald-600 text-white scale-110' : 'bg-slate-900 text-white'}`}><Utensils className="w-6 h-6" /></button></div>
            <NavButton icon={Zap} label={t('coach')} active={activeTab === 'coach'} onClick={() => setActiveTab('coach')} />
          </div>
        </nav>

        {showProfileModal && <ProfileModal currentProfile={userProfile} onSave={(d) => { saveProfileData(d); setShowProfileModal(false); }} onClose={() => setShowProfileModal(false)} onLogout={handleLogout} t={t} lang={lang} toggleLanguage={toggleLanguage} />}
    </div>
  );
};

const App = () => <ErrorBoundary><SmartFitContent /></ErrorBoundary>;

// --- Helper Components ---
const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${active ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
    <Icon className={`w-6 h-6 mb-1 ${active ? 'fill-current' : ''}`} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[10px] font-bold ${active ? 'opacity-100' : 'opacity-0 scale-0'} transition-all`}>{label}</span>
  </button>
);

export default App;