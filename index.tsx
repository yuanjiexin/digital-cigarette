
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Settings, History, Flame, X, ChevronLeft, ChevronRight, RotateCcw, Bell, Clock } from "lucide-react";
import { GoogleGenAI } from "@google/genai";

// --- Types & Constants ---

interface Brand {
  id: string;
  name: string;
  subName: string;
  pricePerStick: number; // in CNY
  filterColorClass: string; // Tailwind classes for basic color
  filterStyle?: React.CSSProperties; // Inline styles for complex gradients/textures
  bodyColor: string;
  textColor: string;
  widthClass: string;
  ringColor?: string;
}

const BRANDS: Brand[] = [
  {
    id: "marlboro",
    name: "Marlboro",
    subName: "万宝路",
    pricePerStick: 1.5,
    filterColorClass: "bg-orange-300",
    filterStyle: {
      background: `
        radial-gradient(circle at 2px 2px, rgba(0,0,0,0.1) 1px, transparent 1px),
        linear-gradient(to right, #a06d48 0%, #d4a373 40%, #8a5a38 100%)
      `,
      backgroundSize: "6px 6px, 100% 100%"
    },
    bodyColor: "from-gray-200 via-white to-gray-300",
    textColor: "text-black",
    widthClass: "w-10",
  },
  {
    id: "chunghwa",
    name: "Chunghwa",
    subName: "中华",
    pricePerStick: 3.5,
    filterColorClass: "bg-red-900",
    filterStyle: {
       background: "linear-gradient(to right, #5a0808 0%, #991b1b 40%, #450a0a 100%)"
    },
    bodyColor: "from-gray-200 via-white to-gray-300",
    textColor: "text-red-700",
    widthClass: "w-10",
    ringColor: "bg-yellow-400"
  },
  {
    id: "esse",
    name: "Esse",
    subName: "爱喜",
    pricePerStick: 1.2,
    filterColorClass: "bg-white",
    filterStyle: {
       background: "linear-gradient(to right, #d1d5db 0%, #ffffff 45%, #9ca3af 100%)"
    },
    bodyColor: "from-gray-100 via-white to-gray-200",
    textColor: "text-blue-400",
    widthClass: "w-6", // Slim
  },
  {
    id: "black_devil",
    name: "Black Devil",
    subName: "黑魔鬼",
    pricePerStick: 2.0,
    filterColorClass: "bg-black",
    filterStyle: {
       background: "linear-gradient(to right, #18181b 0%, #3f3f46 40%, #09090b 100%)"
    },
    bodyColor: "from-zinc-800 via-zinc-700 to-zinc-900",
    textColor: "text-pink-500",
    widthClass: "w-10",
  }
];

interface SmokeRecord {
  id: number;
  date: string;
  timestamp: number;
  brandName: string;
  savedAmount: number;
}

interface AppSettings {
  startTime: string; // "09:00"
  endTime: string;   // "21:00"
  intervalMinutes: number;
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  startTime: "09:00",
  endTime: "22:00",
  intervalMinutes: 60,
  notificationsEnabled: false,
};

// --- Gemini AI Integration ---
const getMotivationalMessage = async (savedAmount: number) => {
  try {
    if (!process.env.API_KEY) return null;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = ai.models.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `You are a witty, slightly dark-humored smoking cessation assistant. The user just finished a "virtual cigarette" instead of a real one, saving ${savedAmount.toFixed(2)} CNY. 
    Give them a very short (max 20 words), punchy fact about health or money they saved. Language: Chinese.`;
    
    const result = await model.generateContent({ contents: prompt });
    return result.response.text;
  } catch (error) {
    console.error("AI Error", error);
    return "肺部感谢你！";
  }
};

// --- Components ---

const App = () => {
  // --- State ---
  const [currentBrandIndex, setCurrentBrandIndex] = useState(0);
  const [isSmoking, setIsSmoking] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [history, setHistory] = useState<SmokeRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  
  // --- Refs ---
  const smokeIntervalRef = useRef<number | null>(null);
  const reminderIntervalRef = useRef<number | null>(null);

  // Load data
  useEffect(() => {
    const savedHistory = localStorage.getItem("smoke_history");
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedSettings = localStorage.getItem("smoke_settings");
    if (savedSettings) setSettings(JSON.parse(savedSettings));
  }, []);

  // Save Settings
  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("smoke_settings", JSON.stringify(newSettings));
  };

  // Notification Logic
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notification");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      updateSettings({ ...settings, notificationsEnabled: true });
      new Notification("Reminders Enabled", { body: "You will be reminded to take a break." });
    }
  };

  // Reminder Check Loop
  useEffect(() => {
    if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);

    reminderIntervalRef.current = window.setInterval(() => {
      if (!settings.notificationsEnabled) return;

      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      // Parse Start/End times
      const [startH, startM] = settings.startTime.split(":").map(Number);
      const [endH, endM] = settings.endTime.split(":").map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      // Check if within active hours
      if (currentTime < startTotal || currentTime > endTotal) return;

      // Check time since last smoke
      const lastSmoke = history.length > 0 ? history[0].timestamp : 0;
      const minutesSinceLast = (Date.now() - lastSmoke) / 60000;

      if (minutesSinceLast >= settings.intervalMinutes) {
        // Check if we already notified recently (to avoid spam, not implemented here for simplicity, assuming browser debounces or user acts)
        // For a real app, we'd track 'lastNotificationTime'
        if (document.hidden) {
           new Notification("Time for a Smoke Break?", { 
             body: `It's been ${Math.floor(minutesSinceLast)} minutes. Have a virtual cigarette!`,
             icon: "https://cdn-icons-png.flaticon.com/512/305/305106.png"
           });
        }
      }
    }, 60000); // Check every minute

    return () => {
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
    };
  }, [settings, history]);


  // Smoking Logic
  const startSmoking = () => {
    if (isSmoking) return;
    
    // Reset state for new cigarette
    setProgress(0);
    setAiMessage(null);
    setShowSummary(false);
    
    setIsSmoking(true);
  };

  const stopSmoking = () => {
    if (smokeIntervalRef.current) {
      clearInterval(smokeIntervalRef.current);
      smokeIntervalRef.current = null;
    }
    setIsSmoking(false);
  };

  const resetCigarette = () => {
    setIsSmoking(false);
    setProgress(0);
    setShowSummary(false);
    setAiMessage(null);
  }

  // Simulation Effect
  useEffect(() => {
    if (isSmoking) {
      const DURATION = 60000; // 60 seconds normally
      const TICK = 50;
      const increment = (TICK / DURATION) * 100;

      smokeIntervalRef.current = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            finishSmoking();
            return 100;
          }
          return prev + increment;
        });
      }, TICK);
    } else {
      if (smokeIntervalRef.current) clearInterval(smokeIntervalRef.current);
    }

    return () => {
      if (smokeIntervalRef.current) clearInterval(smokeIntervalRef.current);
    };
  }, [isSmoking]);

  const finishSmoking = async () => {
    if (smokeIntervalRef.current) clearInterval(smokeIntervalRef.current);
    setIsSmoking(false);
    setShowSummary(true);

    const brand = BRANDS[currentBrandIndex];
    const newRecord: SmokeRecord = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      timestamp: Date.now(),
      brandName: brand.name,
      savedAmount: brand.pricePerStick,
    };

    const newHistory = [newRecord, ...history];
    setHistory(newHistory);
    localStorage.setItem("smoke_history", JSON.stringify(newHistory));

    // Trigger AI
    const msg = await getMotivationalMessage(brand.pricePerStick);
    setAiMessage(msg);
  };

  // --- Swipe Logic ---
  const touchStartRef = useRef(0);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    const distance = touchStartRef.current - touchEnd;
    
    if (Math.abs(distance) > 50) { // Threshold
      if (distance > 0) {
        nextBrand();
      } else {
        prevBrand();
      }
    }
  };

  const nextBrand = () => {
    if (isSmoking) return;
    setCurrentBrandIndex((prev) => (prev + 1) % BRANDS.length);
    setProgress(0);
  };

  const prevBrand = () => {
    if (isSmoking) return;
    setCurrentBrandIndex((prev) => (prev - 1 + BRANDS.length) % BRANDS.length);
    setProgress(0);
  };

  const totalSaved = history.reduce((acc, curr) => acc + curr.savedAmount, 0);
  const currentBrand = BRANDS[currentBrandIndex];

  return (
    <div className="min-h-screen bg-neutral-900 text-white overflow-hidden font-sans select-none relative flex flex-col">
      
      {/* --- Header --- */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-30">
        <button onClick={() => setShowHistory(true)} className="p-3 bg-neutral-800/80 rounded-full backdrop-blur-md border border-white/10 active:scale-95 transition">
          <History className="w-5 h-5 text-gray-300" />
        </button>
        <div className="flex flex-col items-center pt-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Total Saved</span>
          <span className="text-2xl font-bold text-emerald-400 font-mono shadow-emerald-900/50 drop-shadow-lg">
             ¥{totalSaved.toFixed(2)}
          </span>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-3 bg-neutral-800/80 rounded-full backdrop-blur-md border border-white/10 active:scale-95 transition">
          <Settings className="w-5 h-5 text-gray-300" />
        </button>
      </header>

      {/* --- Main Content Area --- */}
      <main 
        className="flex-1 relative w-full flex flex-col items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        
        {/* Brand Info */}
        <div className="absolute top-28 text-center z-20 pointer-events-none flex flex-col items-center w-full px-4">
          <h2 className="text-4xl font-bold tracking-tighter text-white drop-shadow-lg">
            {currentBrand.name}
          </h2>
          {/* Removed subName render here */}
          
          {/* Price Tag */}
          <p className="mt-3 text-yellow-400 font-mono font-bold text-base bg-neutral-900/80 px-4 py-1.5 rounded-full inline-block backdrop-blur-md border border-yellow-400/20 shadow-lg shadow-black/50">
             ¥{currentBrand.pricePerStick.toFixed(1)} / 支
          </p>
        </div>

        {/* Navigation Arrows */}
        {!isSmoking && (
          <>
            <button onClick={prevBrand} className="absolute left-4 top-1/2 p-4 opacity-40 hover:opacity-100 hover:bg-white/5 rounded-full transition z-30">
              <ChevronLeft size={32} />
            </button>
            <button onClick={nextBrand} className="absolute right-4 top-1/2 p-4 opacity-40 hover:opacity-100 hover:bg-white/5 rounded-full transition z-30">
              <ChevronRight size={32} />
            </button>
          </>
        )}

        {/* 3D Cigarette Render */}
        <Cigarette3D 
           brand={currentBrand} 
           progress={progress} 
           isSmoking={isSmoking} 
        />

      </main>

      {/* --- Footer Controls --- */}
      <footer className="pb-16 px-6 flex justify-center z-30 relative items-center">
        {showSummary ? (
          <div className="flex flex-col items-center w-full max-w-xs animate-fade-in mb-8">
             <div className="mb-6 bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-xl text-center w-full backdrop-blur-md">
                <p className="text-emerald-400 font-bold text-lg">Success!</p>
                <p className="text-gray-300 text-sm mt-1">You saved ¥{currentBrand.pricePerStick.toFixed(2)}</p>
                {aiMessage && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-white/90 italic text-sm">"{aiMessage}"</p>
                  </div>
                )}
             </div>
             <button 
                onClick={resetCigarette}
                className="flex items-center justify-center gap-2 w-full bg-white text-black font-bold py-4 rounded-xl active:scale-95 transition-transform shadow-lg shadow-white/10"
             >
                <RotateCcw className="w-5 h-5" />
                再来一根 (New One)
             </button>
          </div>
        ) : isSmoking ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
             <button 
                onClick={stopSmoking}
                className="bg-neutral-800/80 backdrop-blur-md border border-white/10 text-neutral-300 px-8 py-4 rounded-xl font-medium active:scale-95 transition-transform w-full shadow-lg"
             >
                熄灭 (Put Out)
             </button>
          </div>
        ) : (
          <button
            onClick={startSmoking}
            className="group relative w-full max-w-xs bg-gradient-to-b from-orange-600 to-orange-700 text-white text-lg font-bold py-5 rounded-2xl shadow-xl shadow-orange-900/20 active:scale-95 transition-all overflow-hidden ring-1 ring-white/20"
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent"></div>
            <div className="flex items-center justify-center gap-3 relative z-10">
              <Flame className="w-6 h-6 fill-orange-200 text-white animate-pulse" />
              来一根
            </div>
          </button>
        )}
      </footer>

      {/* --- History Modal --- */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-6 animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2"><History /> Records</h2>
            <button onClick={() => setShowHistory(false)} className="p-2 bg-neutral-800 rounded-full"><X /></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
             {history.length === 0 && <p className="text-neutral-500 text-center mt-10">Empty ashtray.</p>}
             {history.map((r) => (
               <div key={r.id} className="flex justify-between p-4 bg-neutral-900 rounded-lg border border-neutral-800">
                 <div><div className="text-white font-medium">{r.brandName}</div><div className="text-xs text-neutral-500">{r.date}</div></div>
                 <div className="text-emerald-400 font-mono">+¥{r.savedAmount.toFixed(2)}</div>
               </div>
             ))}
          </div>
        </div>
      )}
      
       {/* --- Settings Modal --- */}
       {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-6 animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Settings /> Settings</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 bg-neutral-800 rounded-full"><X /></button>
          </div>
          
          <div className="space-y-6">
            
            {/* Active Hours */}
            <div className="p-5 bg-neutral-900 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-2 mb-4 text-orange-400">
                <Clock className="w-5 h-5" />
                <span className="font-bold">Active Hours</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
                  <input 
                    type="time" 
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-white focus:border-orange-500 focus:outline-none"
                    value={settings.startTime}
                    onChange={(e) => updateSettings({...settings, startTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">End Time</label>
                  <input 
                    type="time" 
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-white focus:border-orange-500 focus:outline-none"
                    value={settings.endTime}
                    onChange={(e) => updateSettings({...settings, endTime: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Interval */}
            <div className="p-5 bg-neutral-900 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-2 mb-4 text-blue-400">
                <History className="w-5 h-5" />
                <span className="font-bold">Reminder Interval</span>
              </div>
              <select 
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none appearance-none"
                value={settings.intervalMinutes}
                onChange={(e) => updateSettings({...settings, intervalMinutes: parseInt(e.target.value)})}
              >
                <option value={30}>Every 30 Minutes</option>
                <option value={45}>Every 45 Minutes</option>
                <option value={60}>Every 1 Hour</option>
                <option value={90}>Every 1.5 Hours</option>
                <option value={120}>Every 2 Hours</option>
              </select>
            </div>

            {/* Notification Permission */}
            <div className="p-5 bg-neutral-900 rounded-xl border border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Bell className="w-5 h-5" />
                  <span className="font-bold">Notifications</span>
                </div>
                <div className={`text-xs px-2 py-1 rounded ${settings.notificationsEnabled ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                  {settings.notificationsEnabled ? 'On' : 'Off'}
                </div>
              </div>
              <p className="text-gray-500 text-sm mt-2 mb-4">
                Get a system notification when it's time for a smoke break.
              </p>
              {!settings.notificationsEnabled && (
                <button 
                  onClick={requestNotificationPermission}
                  className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition"
                >
                  Enable Notifications
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

// --- 3D Cigarette Component ---

const Cigarette3D = ({ brand, progress, isSmoking }: { brand: Brand, progress: number, isSmoking: boolean }) => {
  const TOBACCO_HEIGHT = 300; 
  const FILTER_HEIGHT = 80;
  
  // Calculate dynamic heights
  const currentTobaccoHeight = TOBACCO_HEIGHT * (1 - progress / 100);
  const ashHeight = Math.min(TOBACCO_HEIGHT * (progress / 100), 60);
  
  // The point where smoke should emit is at the top of the current tobacco
  // Position from BOTTOM of the container
  const burnPointBottom = FILTER_HEIGHT + currentTobaccoHeight;

  return (
    <div className="relative h-[450px] w-40 flex items-end justify-center perspective-1000">
      
      {/* Smoke Emitter - Follows the burn point */}
      {isSmoking && (
         <div 
           className="absolute left-0 w-full h-20 pointer-events-none z-30 flex justify-center"
           style={{ 
             bottom: `${burnPointBottom}px`, 
             transition: 'bottom 0.1s linear'
            }}
         >
           <SmokeParticles />
         </div>
      )}

      {/* The Stick Wrapper */}
      <div className={`relative flex flex-col-reverse items-center ${brand.widthClass} transition-all duration-300 shadow-2xl`}>
         
         {/* 1. FILTER (Bottom, Fixed) */}
         <div 
            className="w-full relative shrink-0 rounded-b-md overflow-hidden"
            style={{ height: `${FILTER_HEIGHT}px`, ...brand.filterStyle }}
         >
            {/* 3D Shading Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40 pointer-events-none"></div>
            {brand.ringColor && <div className={`absolute top-2 w-full h-1 ${brand.ringColor} opacity-90`}></div>}
         </div>

         {/* 2. TOBACCO BODY (Shrinks) */}
         <div 
            className={`w-full relative bg-gradient-to-r ${brand.bodyColor} transition-all duration-75 ease-linear overflow-hidden`}
            style={{ height: `${currentTobaccoHeight}px` }}
         >
            {/* 3D Shading Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none"></div>
            
            {/* Logo */}
            <div className="absolute bottom-4 w-full text-center opacity-60 rotate-90">
               <span className={`text-[10px] font-bold ${brand.textColor} tracking-widest whitespace-nowrap`}>
                 {brand.name.toUpperCase()}
               </span>
            </div>
         </div>

         {/* 3. BURNING INTERFACE (EMBER) */}
         {isSmoking && (
            <div className="w-full h-1.5 bg-red-500 animate-pulse relative z-10 shadow-[0_0_15px_rgba(255,60,0,0.8)]">
               <div className="absolute inset-0 bg-gradient-to-r from-red-900 via-orange-400 to-red-900"></div>
            </div>
         )}

         {/* 4. ASH (Grows on top) */}
         {isSmoking && progress > 0 && (
            <div 
              className="w-[98%] mx-auto bg-gray-300 relative overflow-hidden rounded-t-sm transition-all duration-75 ease-linear"
              style={{ 
                 height: `${ashHeight}px`,
                 background: "repeating-linear-gradient(45deg, #4b5563, #4b5563 2px, #9ca3af 2px, #9ca3af 4px)"
              }}
            >
               {/* Ash Texture & Gradient */}
               <div className="absolute inset-0 bg-gradient-to-b from-gray-800/50 to-transparent"></div>
               <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40"></div>
            </div>
         )}

      </div>

      {/* Shadow on the 'floor' */}
      <div className="absolute -bottom-8 w-24 h-4 bg-black/30 blur-xl rounded-[100%]"></div>
    </div>
  );
}

const SmokeParticles = () => {
  // Generate random particles
  return (
    <div className="relative w-0 h-full overflow-visible">
      {[...Array(12)].map((_, i) => (
         <div 
           key={i} 
           className="absolute w-6 h-6 bg-gray-400 rounded-full blur-md opacity-0 animate-smoke"
           style={{
              animationDelay: `${i * 0.3}s`,
              left: '50%',
              marginLeft: `${Math.random() * 30 - 15}px`, 
              transform: 'translateX(-50%)'
           }}
         />
      ))}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
