import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameCanvas } from './components/GameCanvas';
import { Trophy, Play, HelpCircle, X, MousePointer2, Info, Shirt, Users, Box, Code, Heart } from 'lucide-react';
import { CostumeId } from './types';

type Screen = 'START' | 'PLAYING' | 'GAMEOVER';

const COSTUMES: { id: CostumeId; name: string; color1: string; color2: string }[] = [
  { id: 'classic', name: 'Classic Spider-Man', color1: 'bg-red-500', color2: 'bg-blue-600' },
  { id: 'symbiote', name: 'Symbiote', color1: 'bg-black', color2: 'bg-white' },
  { id: 'miles', name: 'Miles Morales', color1: 'bg-black', color2: 'bg-red-500' },
  { id: 'gwen', name: 'Spider-Gwen', color1: 'bg-white', color2: 'bg-pink-500' },
  { id: 'iron', name: 'Iron Spider', color1: 'bg-red-600', color2: 'bg-yellow-400' },
  { id: '2099', name: 'Spider-Man 2099', color1: 'bg-blue-800', color2: 'bg-red-500' },
  { id: 'noir', name: 'Spider-Man Noir', color1: 'bg-stone-800', color2: 'bg-stone-950' },
];

const CostumePreview = ({ costumeId }: { costumeId: CostumeId }) => {
  const getCostumeColors = (id: CostumeId) => {
    switch(id) {
      case 'symbiote': return { primary: '#111', secondary: '#000', eye: '#fff', web: '#fff' };
      case 'miles': return { primary: '#111', secondary: '#ef4444', eye: '#ef4444', web: '#ef4444' };
      case 'gwen': return { primary: '#fff', secondary: '#000', eye: '#ec4899', web: '#06b6d4' };
      case 'iron': return { primary: '#ef4444', secondary: '#eab308', eye: '#eab308', web: '#eab308' };
      case '2099': return { primary: '#1d4ed8', secondary: '#ef4444', eye: '#ef4444', web: '#ef4444' };
      case 'noir': return { primary: '#292524', secondary: '#1c1917', eye: '#fff', web: '#a8a29e' };
      case 'classic':
      default: return { primary: '#ef4444', secondary: '#1d4ed8', eye: '#fff', web: '#fff' };
    }
  };

  const colors = getCostumeColors(costumeId);

  return (
    <div className="flex justify-center items-center h-32 w-full my-2">
      <svg width="120" height="120" viewBox="-40 -40 80 80" className="drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
        <g transform="rotate(-20)">
          {/* Webs */}
          <line x1="10" y1="-10" x2="40" y2="-30" stroke={colors.web} strokeWidth="2" />
          <line x1="10" y1="10" x2="40" y2="30" stroke={colors.web} strokeWidth="2" />
          
          {/* Legs */}
          <line x1="-8" y1="-5" x2="-22" y2="-10" stroke={colors.secondary} strokeWidth="6" strokeLinecap="round" />
          <line x1="-8" y1="5" x2="-22" y2="10" stroke={colors.secondary} strokeWidth="6" strokeLinecap="round" />
          
          {/* Arms */}
          <line x1="5" y1="-5" x2="15" y2="-15" stroke={colors.primary} strokeWidth="5" strokeLinecap="round" />
          <line x1="5" y1="5" x2="15" y2="15" stroke={colors.primary} strokeWidth="5" strokeLinecap="round" />

          {/* Body */}
          <ellipse cx="0" cy="0" rx="14" ry="10" fill={colors.primary} />
          
          {/* Head */}
          <circle cx="12" cy="0" r="8" fill={colors.primary} />
          
          {/* Eyes */}
          <circle cx="15" cy="-3" r="2.5" fill={colors.eye} />
          <circle cx="15" cy="3" r="2.5" fill={colors.eye} />
        </g>
      </svg>
    </div>
  );
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('START');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const [highScore, setHighScore] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [costume, setCostume] = useState<CostumeId>('classic');

  useEffect(() => {
    const saved = localStorage.getItem('spider-swing-highscore');
    if (saved) setHighScore(parseInt(saved));
    
    const savedCostume = localStorage.getItem('spider-swing-costume') as CostumeId;
    if (savedCostume && COSTUMES.find(c => c.id === savedCostume)) {
      setCostume(savedCostume);
    }
  }, []);

  const handleCostumeChange = (id: CostumeId) => {
    setCostume(id);
    localStorage.setItem('spider-swing-costume', id);
  };

  const handleGameOver = (finalScore: number) => {
    setScore(finalScore);
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('spider-swing-highscore', finalScore.toString());
    }
    setScreen('GAMEOVER');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-red-500 selection:text-white overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#ef4444_0%,transparent_50%)]" />
      </div>

      <AnimatePresence mode="wait">
        {screen === 'START' && (
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center min-h-screen p-4 text-center w-full max-w-md mx-auto"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="mb-6"
            >
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-red-600 uppercase italic drop-shadow-[0_5px_15px_rgba(239,68,68,0.5)]">
                TinySpiders
              </h1>
              <p className="text-slate-400 text-base md:text-lg font-medium tracking-wide mt-1">
                CITY ADVENTURE
              </p>
            </motion.div>

            {/* Costume Selector with Preview */}
            <div className="mb-6 w-full bg-slate-900/50 p-4 rounded-3xl border border-slate-800 backdrop-blur-sm flex flex-col items-center">
              <div className="flex items-center justify-center gap-2 mb-1 text-slate-400 text-sm font-bold uppercase tracking-wider">
                <Shirt size={16} />
                <span>kayra naber</span>
              </div>
              
              <CostumePreview costumeId={costume} />
              
              <div className="text-xl font-black italic text-white mb-4 tracking-wider">
                {COSTUMES.find(c => c.id === costume)?.name}
              </div>

              <div className="flex overflow-x-auto w-full gap-3 pb-2 px-2 snap-x scrollbar-hide justify-start md:justify-center">
                {COSTUMES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleCostumeChange(c.id)}
                    className={`relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden border-2 transition-all snap-center ${
                      costume === c.id ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'border-slate-700 opacity-60 hover:opacity-100'
                    }`}
                    title={c.name}
                  >
                    <div className={`absolute inset-0 ${c.color1} w-full h-1/2`} />
                    <div className={`absolute bottom-0 ${c.color2} w-full h-1/2`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => {
                  setScore(0);
                  setLives(5);
                  setScreen('PLAYING');
                }}
                className="group relative flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white py-4 px-8 rounded-2xl font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              >
                <Play className="fill-current" />
                OYUNA BAŞLA
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowHowTo(true)}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-4 px-2 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
                >
                  <HelpCircle size={18} />
                  NASIL OYNANIR?
                </button>
                <button
                  onClick={() => setShowAboutUs(true)}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-4 px-2 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
                >
                  <Users size={18} />
                  HAKKIMIZDA
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-slate-500 text-sm">
              <Trophy size={16} className="text-yellow-500" />
              <span className="font-bold tracking-wider">EN YÜKSEK SKOR: {highScore}</span>
            </div>
          </motion.div>
        )}

        {screen === 'PLAYING' && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-[100dvh] flex flex-col"
          >
            <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 px-4 py-1.5 rounded-full shadow-xl">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block">SKOR</span>
                <span className="text-xl font-black text-white tabular-nums">{score}</span>
              </div>
              
              <div className="flex gap-1 bg-slate-900/80 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-full shadow-xl">
                {[...Array(5)].map((_, i) => (
                  <Heart 
                    key={i} 
                    size={20} 
                    className={`${i < lives ? 'fill-red-500 text-red-500' : 'fill-slate-800 text-slate-700'} transition-colors`} 
                  />
                ))}
              </div>
            </div>

            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setScreen('START')}
                className="p-2.5 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full hover:bg-red-600 transition-colors group"
              >
                <X size={20} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>

            <GameCanvas 
              costume={costume}
              onGameOver={handleGameOver} 
              onScoreUpdate={setScore}
              onLivesUpdate={setLives}
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none w-full px-4 flex justify-center">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10 flex items-center gap-2 max-w-full">
                <MousePointer2 size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs font-bold text-white/80 uppercase tracking-tight text-center">
                  Sol/Sağ Tık: Salın | SPACE: Ağ Atışı | A-D/←-→: Yürü
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {screen === 'GAMEOVER' && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center w-full max-w-md mx-auto"
          >
            <h2 className="text-5xl md:text-7xl font-black text-white uppercase italic mb-6">
              OYUN BİTTİ
            </h2>
            
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl mb-8 w-full">
              <div className="mb-6">
                <p className="text-slate-500 uppercase tracking-widest font-bold text-xs mb-1">SKORUN</p>
                <p className="text-6xl font-black text-red-500">{score}</p>
              </div>
              
              <div className="pt-6 border-t border-slate-800">
                <p className="text-slate-500 uppercase tracking-widest font-bold text-xs mb-1">EN YÜKSEK SKOR</p>
                <p className="text-3xl font-black text-white">{highScore}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => {
                  setScore(0);
                  setLives(5);
                  setScreen('PLAYING');
                }}
                className="bg-red-600 hover:bg-red-500 text-white py-4 px-8 rounded-2xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
              >
                TEKRAR DENE
              </button>
              <button
                onClick={() => setScreen('START')}
                className="bg-slate-800 hover:bg-slate-700 text-white py-4 px-8 rounded-2xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
              >
                MENÜYE DÖN
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* How To Play Modal */}
      <AnimatePresence>
        {showHowTo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl max-w-md w-full relative"
            >
              <button
                onClick={() => setShowHowTo(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
              >
                <X />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-red-600 rounded-2xl">
                  <Info className="text-white" size={20} />
                </div>
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">Nasıl Oynanır?</h3>
              </div>

              <div className="space-y-5">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-red-500 text-sm">1</div>
                  <p className="text-slate-300 leading-relaxed text-sm md:text-base">
                    Ekranın <span className="text-white font-bold">Soluna</span> veya <span className="text-white font-bold">Sağına</span> dokunarak/tıklayarak o yöne ağ at.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-red-500 text-sm">2</div>
                  <p className="text-slate-300 leading-relaxed text-sm md:text-base">
                    İki tarafa aynı anda basılı tutarsan <span className="text-red-400 font-bold">çift ağ</span> atarsın ve seni çok daha güçlü bir şekilde yukarı çeker!
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-red-500 text-sm">3</div>
                  <p className="text-slate-300 leading-relaxed text-sm md:text-base">
                    Yere düşmemeye dikkat et! Ne kadar uzağa gidersen o kadar çok puan kazanırsın.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowHowTo(false)}
                className="w-full mt-8 bg-red-600 hover:bg-red-500 text-white py-3.5 rounded-xl font-bold text-lg transition-all"
              >
                ANLADIM!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* About Us Modal */}
      <AnimatePresence>
        {showAboutUs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl max-w-md w-full relative"
            >
              <button
                onClick={() => setShowAboutUs(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
              >
                <X />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-600 rounded-2xl">
                  <Users className="text-white" size={20} />
                </div>
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">Hakkımızda</h3>
              </div>

              <div className="space-y-4">
                <p className="text-slate-300 leading-relaxed text-sm md:text-base">
                  Biz, oyun dünyasına tutkuyla bağlı yaratıcı bir <span className="text-white font-bold">ekibiz</span>.
                </p>
                <div className="flex items-start gap-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <Box className="text-blue-400 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="text-white font-bold mb-1">3D Modelleme</h4>
                    <p className="text-slate-400 text-sm">Karakterleri, çevre detaylarını ve oyun dünyasını en ince ayrıntısına kadar 3 boyutlu olarak tasarlıyoruz.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <Code className="text-green-400 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="text-white font-bold mb-1">Yazılım Geliştirme</h4>
                    <p className="text-slate-400 text-sm">Fizik motorları, oyun mekanikleri ve akıcı bir deneyim için modern yazılım teknolojilerini kullanıyoruz.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowAboutUs(false)}
                className="w-full mt-8 bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-bold text-lg transition-all"
              >
                KAPAT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
