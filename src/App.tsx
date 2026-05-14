import React, { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { motion, useScroll, useTransform, useSpring, useMotionValue, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, 
  Zap, 
  Target, 
  Users, 
  Play, 
  CheckCircle2, 
  ArrowUpRight,
  ShieldCheck,
  FileText,
  Calendar,
  MessageSquare,
  Lock,
  Sparkles,
  TrendingUp,
  Layout,
  MousePointer2,
  ChevronRight,
  Plus,
  Minus,
  ChevronUp,
  Menu,
  X,
  MessageCircle,
  Send,
  Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, serverTimestamp, updateDoc, arrayUnion, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Global anonymous auth initialization
const initializeAuth = async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    console.log("Anonymous authentication successful:", userCredential.user.uid);
  } catch (error) {
    console.error("Anonymous authentication failed:", error);
  }
};
initializeAuth();

// Helper to wait for auth readiness
const waitForAuth = async (timeoutMs = 10000): Promise<boolean> => {
  if (auth.currentUser) return true;
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe();
        resolve(true);
      }
    });
    setTimeout(() => {
      unsubscribe();
      resolve(!!auth.currentUser);
    }, timeoutMs);
  });
};

// Test Firestore connection on boot
const testConnection = async () => {
  try {
    await waitForAuth();
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful (Long Polling & Auth enabled).");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    } else {
      console.warn("Firestore connectivity check log:", error);
    }
  }
};
testConnection();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, rotateX: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    rotateX: 0,
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1] }
  }
};

function FloatingCard({ children, className, scrollProgress, index = 0 }: { children: React.ReactNode, className?: string, scrollProgress: any, index?: number }) {
  const yParallax = useTransform(scrollProgress, [0, 1], [0, -100 * (index + 1)]);
  
  return (
    <motion.div
      style={{ y: yParallax }}
      animate={{ 
        y: [0, -15, 0],
        rotateZ: [-1, 1, -1],
        rotateX: [-2, 2, -2]
      }}
      transition={{ 
        duration: 4 + (index % 3), 
        repeat: Infinity, 
        ease: "easeInOut" 
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ParticleBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            opacity: Math.random() * 0.5,
            x: Math.random() * 100 + "%",
            y: Math.random() * 100 + "%",
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            y: [null, Math.random() * -100 - 50],
            opacity: [null, 0]
          }}
          transition={{ 
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute w-1 h-1 bg-[#F27D26] rounded-full blur-[1px]"
        />
      ))}
    </div>
  );
}

function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [email, setEmail] = useState("");
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize session and load history
  useEffect(() => {
    let sid = localStorage.getItem('forge_chat_session');
    const sidRegex = /^[a-zA-Z0-9_-]+$/;
    
    if (!sid || !sidRegex.test(sid)) {
      sid = 'session_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('forge_chat_session', sid);
    }
    setSessionId(sid);

    const loadHistory = async () => {
      try {
        await waitForAuth();
        
        const docRef = doc(db, 'support_chats', sid);
        const docSnap = await getDoc(docRef).catch(err => handleFirestoreError(err, OperationType.GET, `support_chats/${sid}`));
        if (docSnap.exists()) {
          setMessages(docSnap.data().messages || []);
        } else {
          setMessages([
            { role: 'bot', content: "SYSTEM ONLINE. I am Forge-Alpha. Tactical support unit engaged. How can I assist your protocol implementation today?" }
          ]);
        }
      } catch (error) {
        // Silent fail or handle correctly
        console.error("Failed to load chat history", error);
        setMessages([
          { role: 'bot', content: "SYSTEM ONLINE. I am Forge-Alpha. Tactical support unit engaged. How can I assist your protocol implementation today?" }
        ]);
      }
    };

    loadHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const msg = customMsg || input;
    if (!msg.trim() || isLoading || !sessionId) return;

    const userMessage = { role: 'user', content: msg } as const;
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await waitForAuth();
      
      // Persist user message immediately
      const chatRef = doc(db, 'support_chats', sessionId);
      const chatSnap = await getDoc(chatRef).catch(err => handleFirestoreError(err, OperationType.GET, `support_chats/${sessionId}`));
      
      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          userId: sessionId,
          messages: [userMessage],
          updatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'support_chats'));
      } else {
        await updateDoc(chatRef, {
          messages: arrayUnion(userMessage),
          updatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, 'support_chats'));
      }

      // AI Response logic
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `You are the "Forge-Alpha" support AI for the Forge Protocol (a high-ticket agency lead gen system). 
          Your tone is technical, sharp, slightly aggressive, and highly professional (military/tech aesthetic). 
          Keep answers brief and tactical. 
          Context: 1. It's a Notion workspace system. 2. Price is $9 one-time. 3. Strategy: 20 targeted DMs daily. 
          If user asks about effectiveness, cite the "survival of the business depends on volume" logic.
          If user seems interested, ask for their email to "log their operational intent".
          
          User said: ${msg}` }] }
        ],
        config: {
          systemInstruction: "You are Forge-Alpha. Tactical support AI. Concise, military-tech tone. You represent the Forge Protocol.",
          temperature: 0.7,
        }
      });

      const botReply = response.text || "COMMUNICATION LINK UNSTABLE. RE-ESTABLISHING...";
      const botMessage = { role: 'bot', content: botReply } as const;
      
      setMessages(prev => [...prev, botMessage]);

      // Persist bot message
      await updateDoc(chatRef, {
        messages: arrayUnion(botMessage),
        updatedAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, 'support_chats'));

      if (!leadCaptured && (botReply.toLowerCase().includes("email") || botReply.toLowerCase().includes("log"))) {
        setShowEmailCapture(true);
      }

    } catch (error) {
      console.error("AI/Firebase Error:", error);
      setMessages(prev => [...prev, { role: 'bot', content: "SIGNAL LOST. TRY AGAIN." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return;
    
    try {
      await waitForAuth();
      const leadId = 'lead_' + Math.random().toString(36).substring(2, 11);
      await setDoc(doc(db, 'leads', leadId), {
        email: email,
        source: 'support_chat',
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'leads'));

      setLeadCaptured(true);
      setShowEmailCapture(false);
      const successMsg = { role: 'bot', content: `LOGGED: ${email}. Interest recorded. Proceed.` } as const;
      setMessages(prev => [...prev, successMsg]);
      
      if (sessionId) {
        await updateDoc(doc(db, 'support_chats', sessionId), {
          messages: arrayUnion(successMsg),
          updatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, 'support_chats'));
      }
    } catch (error) {
      console.error("Lead Capture Error:", error);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-32 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="w-[90vw] sm:w-[380px] h-[500px] sm:h-[600px] glass-card border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl mb-4 bg-black/60 backdrop-blur-3xl"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F27D26] flex items-center justify-center animate-pulse shadow-[0_0_15px_rgba(242,125,38,0.5)]">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-black uppercase text-white/40 tracking-widest">FORGE-ALPHA</div>
                  <div className="text-[8px] text-[#F27D26] font-mono uppercase tracking-tighter">LIVE_INTEL_STREAM</div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-xs sm:text-sm font-light leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-[#F27D26] text-white rounded-tr-none' 
                      : 'bg-white/5 text-white/50 border border-white/5 rounded-tl-none italic font-mono'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5">
                    <Loader2 className="w-4 h-4 text-[#F27D26] animate-spin" />
                  </div>
                </div>
              )}

              {showEmailCapture && !leadCaptured && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#F27D26]/10 border border-[#F27D26]/20 p-6 rounded-[2rem]"
                >
                  <p className="text-[9px] font-mono text-[#F27D26] uppercase mb-4 tracking-widest text-center">SYSTEM_IDENTIFICATION_REQUIRED</p>
                  <form onSubmit={handleLeadCapture} className="space-y-3">
                    <input 
                      type="email" 
                      placeholder="ENTER_EMAIL..."
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-[#F27D26] outline-none transition-all placeholder:text-white/5 font-mono"
                    />
                    <button className="w-full py-3 bg-[#F27D26] text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                      LOG_PROTOCOL_ACCESS
                    </button>
                  </form>
                </motion.div>
              )}
            </div>

            <div className="p-4 flex gap-2 overflow-x-auto scrollbar-hide border-t border-white/5">
              {["PROCESS?", "PRICE?", "BEGINNER?"].map((q) => (
                <button 
                  key={q}
                  onClick={() => handleSendMessage(undefined, q)}
                  className="whitespace-nowrap px-4 py-2 bg-white/5 border border-white/5 rounded-full text-[8px] font-mono uppercase tracking-widest text-white/20 hover:text-white hover:border-[#F27D26]/30 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-6 border-t border-white/5 flex gap-3 bg-white/[0.01]">
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="TRANSMIT_COMMAND..."
                className="flex-1 bg-transparent border-none text-white text-xs font-mono outline-none placeholder:text-white/5"
              />
              <button type="submit" disabled={isLoading} className="text-[#F27D26] disabled:opacity-50">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 sm:w-16 sm:h-16 bg-[#F27D26] rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 group relative"
      >
        {isOpen ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
        {!isOpen && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-black animate-bounce" />
        )}
      </motion.button>
    </div>
  );
}

function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '', interests: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return;
    
    setStatus('loading');
    try {
      await waitForAuth();
      const leadId = 'lead_' + Math.random().toString(36).substring(2, 11);
      await setDoc(doc(db, 'leads', leadId), {
        name: formData.name,
        email: formData.email,
        interests: formData.interests,
        source: 'contact_form',
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'leads'));
      
      setStatus('success');
      setFormData({ name: '', email: '', interests: '' });
    } catch (error) {
      console.error("Contact Form Error:", error);
      setStatus('error');
    }
  };

  return (
    <section id="contact" className="py-24 sm:py-48 relative overflow-hidden bg-white/[0.01]">
      <div className="max-w-xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full border border-[#F27D26]/20 bg-[#F27D26]/5 text-[10px] font-mono tracking-[0.4em] uppercase text-[#F27D26]">
            COMMUNICATIONS_MODULE
          </div>
          <h2 className="text-4xl sm:text-7xl font-display font-black uppercase italic tracking-tighter">
            JOIN THE <span className="text-[#F27D26]">FORGE.</span>
          </h2>
          <p className="text-white/40 text-sm sm:text-lg font-light italic mb-12">
            Submit your protocol intent. We screen every participant for absolute commitment.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-white/20 ml-2 tracking-[0.2em]">IDENTIFICATION_NAME</label>
              <input 
                type="text" 
                placeholder="ENTER_NAME..."
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-[#F27D26] outline-none transition-all font-mono placeholder:text-white/5"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-white/20 ml-2 tracking-[0.2em]">COMM_EMAIL</label>
              <input 
                type="email" 
                placeholder="ENTER_EMAIL..."
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-[#F27D26] outline-none transition-all font-mono placeholder:text-white/5"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-white/20 ml-2 tracking-[0.2em]">OPERATIONAL_INTENT</label>
              <textarea 
                placeholder="DESCRIBE_YOUR_GOALS..."
                rows={4}
                value={formData.interests}
                onChange={e => setFormData({...formData, interests: e.target.value})}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-[#F27D26] outline-none transition-all font-mono placeholder:text-white/5 resize-none"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={status === 'loading'}
              className="w-full py-6 bg-[#F27D26] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:shadow-[0_0_50px_rgba(242,125,38,0.4)] transition-all disabled:opacity-50 relative overflow-hidden"
            >
              <span className="relative z-10">
                {status === 'loading' ? 'TRANSMITTING_INTEL...' : 'INITIALIZE_PROTOCOL'}
              </span>
              <motion.div 
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                animate={status === 'loading' ? { x: "100%" } : { x: "-100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </button>

            <AnimatePresence>
              {status === 'success' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 font-mono text-[10px] uppercase text-center tracking-widest">
                  TRANSMISSION_SUCCESSFUL: Protocol invitation pending review.
                </motion.div>
              )}
              {status === 'error' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-mono text-[10px] uppercase text-center tracking-widest">
                  SIGNAL_FAILED: Re-attempt transmission.
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      </div>
    </section>
  );
}

export default function App() {
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress, scrollY } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      setShowBackToTop(latest > 500);
    });
  }, [scrollY]);

  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Parallax and 3D transforms
  const heroRotateX = useTransform(scrollYProgress, [0, 0.2], [5, 25]);
  const heroTranslateZ = useTransform(scrollYProgress, [0, 0.2], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.85]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX / innerWidth) - 0.5);
    mouseY.set((clientY / innerHeight) - 0.5);
  };

  const dashboardRotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [10, -10]));
  const dashboardRotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-10, 10]));

  const handlePurchase = () => {
    if (!agreed) {
      const element = document.getElementById('terms-agreement');
      element?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const businessEmail = 'raufacts777@gmail.com';
    const itemName = 'Land Your First Video Editing Client in 7 Days (20 DM System)';
    const amount = '9.00';
    const currency = 'USD';
    const paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(businessEmail)}&item_name=${encodeURIComponent(itemName)}&amount=${amount}&currency_code=${currency}&no_shipping=1&no_note=1`;
    window.open(paypalUrl, '_blank');
  };

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-black text-white font-sans selection:bg-[#F27D26] selection:text-white perspective-2000 overflow-x-hidden"
    >
      <div className="grain-overlay" />
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[80%] h-[80%] bg-[#F27D26]/5 blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[60%] h-[60%] bg-[#FF4D00]/3 blur-[150px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-[#F27D26] z-[100] origin-left"
        style={{ scaleX }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-50 px-4 sm:px-6 py-4 sm:py-6 border-b border-white/5 backdrop-blur-xl bg-black/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-[#F27D26] to-[#FF4D00] rounded-lg sm:rounded-2xl flex items-center justify-center shadow-2xl shadow-[#F27D26]/30 group-hover:rotate-[15deg] transition-all duration-500">
              <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-white fill-white" />
            </div>
            <span className="text-lg sm:text-2xl font-display font-black tracking-tighter uppercase whitespace-nowrap">FORGE<span className="text-[#F27D26]"> PROTOCOL</span></span>
          </motion.div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-12 font-mono text-[10px] uppercase tracking-[0.4em] text-white/40">
            {[
              { label: 'Manifesto', href: '#manifesto' },
              { label: 'Inside', href: '#process' },
              { label: 'FAQ', href: '#faq' }
            ].map((item) => (
              <a 
                key={item.label} 
                href={item.href} 
                className="hover:text-[#F27D26] transition-all duration-300 relative group"
              >
                {item.label}
                <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#F27D26] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
            
            <motion.button 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ 
                scale: 1.05,
                boxShadow: "0 0 20px rgba(242, 125, 38, 0.3)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePurchase}
              className="group relative px-6 py-3 bg-white text-black rounded-full text-xs font-black uppercase tracking-widest hover:bg-[#F27D26] hover:text-white transition-all duration-500 shadow-2xl shadow-white/5 active:scale-95 overflow-hidden"
            >
              <motion.div 
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none"
              />
              <span className="relative z-10">Access System</span>
            </motion.button>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl border border-white/10"
          >
            {isMenuOpen ? <X className="w-5 h-5 text-[#F27D26]" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-2xl border-b border-white/5 overflow-hidden"
            >
              <div className="p-8 flex flex-col gap-8 font-mono text-[10px] uppercase tracking-[0.4em]">
                {[
                  { label: "Manifesto", href: "#manifesto" },
                  { label: "The Engine", href: "#process" },
                  { label: "FAQ", href: "#faq" }
                ].map((item) => (
                  <a 
                    key={item.label}
                    href={item.href} 
                    onClick={() => setIsMenuOpen(false)}
                    className="flex justify-between items-center group"
                  >
                    <span className="text-white/40 group-hover:text-[#F27D26] transition-colors">{item.label}</span>
                    <ArrowRight className="w-4 h-4 text-[#F27D26] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { handlePurchase(); setIsMenuOpen(false); }}
                  className="w-full py-6 bg-[#F27D26] text-white rounded-2xl font-black text-sm uppercase tracking-widest mt-4 shadow-2xl shadow-[#F27D26]/20 flex items-center justify-center gap-3 relative overflow-hidden"
                >
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#fff_1px,transparent_1px)] bg-[size:20px_20px]"
                  />
                  <span className="relative z-10 flex items-center gap-3">
                    Access Protocol <ArrowUpRight className="w-5 h-5" />
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Huge 3D Hero */}
      <section className="relative pt-32 sm:pt-48 pb-32 overflow-visible">
        <ParticleBackground />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div style={{ opacity: heroOpacity, scale: heroScale, rotateX: heroRotateX, translateY: heroTranslateZ }}>
            <div className="text-center mb-24">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-3 px-6 py-2 rounded-full border border-[#F27D26]/20 bg-[#F27D26]/5 text-[10px] sm:text-xs font-mono tracking-[0.4em] uppercase text-[#F27D26] mb-12 shadow-[0_0_20px_rgba(242,125,38,0.1)]"
              >
                <Sparkles className="w-3 h-3 animate-pulse" />
                25 Licenses Available for Early Forging
              </motion.div>

              <motion.h1 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="text-5xl sm:text-8xl md:text-[11rem] font-display font-black leading-[0.8] tracking-tighter mb-8 sm:mb-12 text-glow preserve-3d"
              >
                <motion.span variants={itemVariants} className="block">STOP WISHING.</motion.span>
                <motion.span variants={itemVariants} className="block text-[#F27D26] italic">START FORGING.</motion.span>
                <motion.span variants={itemVariants} className="block text-white/5">GET CLIENTS.</motion.span>
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="max-w-xl mx-auto text-base sm:text-2xl text-white/40 mb-10 sm:mb-16 leading-relaxed font-light italic px-4 sm:px-0"
              >
                The industrial-grade Notion engine to land high-ticket video clients in 7 days. Built for velocity.
              </motion.p>
            </div>
          </motion.div>

          {/* Interactive 3D Mockup Stage */}
          <div className="relative mt-20 max-w-6xl mx-auto perspective-2000 px-4 sm:px-0">
            {/* Background Depth Layers */}
            <motion.div 
              style={{ y: useTransform(scrollYProgress, [0, 0.5], [0, 200]) }}
              className="absolute -top-20 -left-20 w-64 h-64 bg-[#F27D26]/10 rounded-full blur-[100px] pointer-events-none" 
            />
            
            <motion.div
              style={{ rotateX: dashboardRotateX, rotateY: dashboardRotateY }}
              className="preserve-3d transition-all duration-300 ease-out sm:duration-100 scale-100 sm:scale-110 relative z-20"
            >
              <div className="relative glass-card rounded-[1.5rem] sm:rounded-[3.5rem] border-white/10 overflow-hidden shadow-[0_50px_100px_-50px_rgba(242,125,38,0.5)] sm:shadow-[0_120px_200px_-60px_rgba(242,125,38,0.6)] backdrop-blur-2xl bg-black/40">
                {/* Mockup Toolbar */}
                <div className="bg-white/5 border-b border-white/5 px-4 sm:px-10 py-5 sm:py-8 flex items-center justify-between overflow-hidden relative">
                  <motion.div 
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"
                  />
                  <div className="flex gap-1.5 sm:gap-2">
                    <div className="w-2 sm:w-3 h-2 sm:h-3 rounded-full bg-red-500/50" />
                    <div className="w-2 sm:w-3 h-2 sm:h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-2 sm:w-3 h-2 sm:h-3 rounded-full bg-green-500/50" />
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-[8px] sm:text-[10px] font-mono text-white/20 tracking-widest uppercase truncate ml-4">
                    <Lock className="w-2.5 sm:w-3 h-2.5 sm:h-3 shrink-0" /> forge-protocol-v2.notion
                  </div>
                </div>
                
                {/* Mockup Content */}
                <div className="p-6 sm:p-20 bg-gradient-to-b from-white/[0.03] to-transparent relative">
                  <motion.div 
                    animate={{ y: ["0%", "100%", "0%"] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-x-0 h-px bg-[#F27D26]/20 z-10 shadow-[0_0_15px_rgba(242,125,38,0.5)]"
                  />
                  <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-12 relative z-0">
                    <div className="md:col-span-8 space-y-8 sm:space-y-12">
                      <div className="w-20 sm:w-24 h-1.5 sm:h-2 text-[#F27D26] font-mono text-[10px] sm:text-base">WORKSPACE /</div>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="h-8 sm:h-12 w-3/4 rounded-lg sm:rounded-xl bg-white/5 animate-pulse" />
                        <div className="h-3 sm:h-4 w-full rounded-md bg-white/[0.02]" />
                        <div className="h-3 sm:h-4 w-5/6 rounded-md bg-white/[0.02]" />
                      </div>
                      <div className="grid grid-cols-3 gap-3 sm:gap-6">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="aspect-square rounded-xl sm:rounded-2xl bg-white/5 flex items-center justify-center">
                            <Target className="w-4 sm:w-6 h-4 sm:h-6 text-white/10" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-4 space-y-6 sm:space-y-8">
                       <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[#F27D26]/10 border border-[#F27D26]/20">
                          <div className="text-[8px] sm:text-[10px] font-mono text-[#F27D26] mb-1 sm:mb-2 uppercase">Core Engine</div>
                          <div className="text-lg sm:text-xl font-bold">20 DM DAILY</div>
                       </div>
                       <div className="space-y-3 sm:space-y-4">
                          {[1, 2, 3, 4].map(i => (
                             <div key={i} className="h-8 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 border border-white/5 flex items-center px-3 sm:px-4">
                                <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[#F27D26]/40 mr-2 sm:mr-3" />
                                <div className="h-1.5 sm:h-2 w-full bg-white/5 rounded-full" />
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements Around Mockup - Reduced size for mobile */}
              <FloatingCard scrollProgress={scrollYProgress} index={1} className="absolute -top-6 -left-2 sm:-top-20 sm:-left-20 z-20">
                <div className="glass-card p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-[#F27D26]/40 shadow-2xl space-y-2 sm:space-y-4">
                  <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F27D26] flex items-center justify-center text-white">
                    <TrendingUp className="w-5 sm:w-8 h-5 sm:h-8" />
                  </div>
                  <div className="text-[8px] sm:text-xs font-mono uppercase tracking-widest text-[#F27D26]">+2,400% ROI</div>
                </div>
              </FloatingCard>

              <FloatingCard scrollProgress={scrollYProgress} index={2} className="absolute -bottom-6 -right-2 sm:-bottom-16 sm:-right-10 z-20">
                <div className="glass-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border-white/10 shadow-2xl space-y-2">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                      <CheckCircle2 className="w-5 sm:w-6 h-5 sm:h-6" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold">RETAINER SIGNED</div>
                      <div className="text-[8px] sm:text-[10px] text-white/40 uppercase">$2,500/mo</div>
                    </div>
                  </div>
                </div>
              </FloatingCard>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 mt-20 sm:mt-32 px-4 sm:px-0"
          >
            <button 
              onClick={handlePurchase}
              className="w-full sm:w-auto group relative px-8 sm:px-12 py-6 sm:py-8 bg-[#F27D26] text-white rounded-2xl sm:rounded-[2rem] font-black text-lg sm:text-2xl uppercase tracking-widest overflow-hidden transition-all duration-700 hover:shadow-[0_0_80px_-10px_rgba(242,125,38,0.7)] hover:scale-105 active:scale-95"
            >
              <span className="relative z-10 flex items-center justify-center gap-3 sm:gap-4">
                Forge Your Future <ArrowRight className="w-6 sm:w-8 h-6 sm:h-8 transition-transform group-hover:translate-x-2" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Ticker Section - Huge Spatial Text */}
      <section className="py-16 sm:py-24 border-y border-white/5 bg-white/[0.01] overflow-hidden whitespace-nowrap">
        <motion.div 
          animate={{ x: [0, -2000] }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="flex gap-12 sm:gap-24 items-center text-4xl sm:text-[8rem] font-display font-black text-white/[0.03] uppercase italic tracking-[0.2em]"
        >
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex gap-12 sm:gap-24 shrink-0 transition-opacity hover:text-[#F27D26]/20">
               <span>Land Clients</span>
               <span className="text-[#F27D26]/10">7 Day Sprint</span>
               <span>No Excuses</span>
               <span className="text-[#F27D26]/10">Notion Engine</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* The Manifesto - 3D Narrative */}
      <section id="manifesto" className="py-24 sm:py-48 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 sm:gap-32 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-8 sm:space-y-12"
          >
            <div className="w-16 sm:w-20 h-1 sm:h-1.5 bg-[#F27D26]" />
            <h2 className="text-4xl sm:text-8xl font-display font-black leading-[0.85] uppercase tracking-tighter">
              YOU ARE <br />
              <span className="text-white/20">TRAPPED IN</span> <br />
              <span className="text-[#F27D26] underline decoration-white/10 underline-offset-4 sm:underline-offset-8">THE VOID.</span>
            </h2>
            <div className="space-y-6 sm:space-y-8 text-lg sm:text-2xl text-white/50 font-light leading-relaxed">
              <p>Watching tutorials won't pay your rent. Thinking about your portfolio won't close orders. The "Perfect Reel" is a myth that keeps you broke.</p>
              <div className="p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] bg-white/[0.03] border-l-4 sm:border-l-8 border-[#F27D26] shadow-2xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-[#F27D26]/5 rounded-full blur-3xl group-hover:bg-[#F27D26]/10 transition-all" />
                 <p className="text-base sm:text-white font-bold italic relative z-10">
                   "We replace inspiration with industrial-grade logic. 20 DMs. Every day. Verified scripts. Pure throughput."
                 </p>
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, rotateY: 30 }}
            whileInView={{ opacity: 1, rotateY: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="relative h-auto lg:h-[700px] flex items-center justify-center preserve-3d mt-12 lg:mt-0"
          >
            <div className="absolute inset-0 bg-[#F27D26]/5 blur-[100px] sm:blur-[150px] rounded-full scale-125 sm:scale-150 rotate-12" />
            <div className="glass-card w-full max-w-lg p-8 sm:p-16 rounded-[2rem] sm:rounded-[4rem] relative z-10 border-[#F27D26]/30 shadow-[0_30px_60px_-10px_rgba(242,125,38,0.2)] sm:shadow-[0_50px_100px_-20px_rgba(242,125,38,0.2)]">
              <div className="absolute -top-6 -right-6 sm:-top-10 sm:-right-10 w-20 h-20 sm:w-28 h-28 bg-[#F27D26] rounded-full flex items-center justify-center rotate-12 shadow-2xl z-20">
                <Target className="w-10 h-10 sm:w-14 h-14 text-white" />
              </div>
              <h3 className="text-2xl sm:text-4xl font-display font-black mb-8 sm:mb-12 tracking-tight">THE PROTOCOL</h3>
              <ul className="space-y-6 sm:space-y-10">
                {[
                  { t: "Deploy the Engine", d: "Duplicate the Notion system instantly." },
                  { t: "Targeted Scouting", d: "Find 20 verified leads daily." },
                  { t: "The Bridge Script", d: "Convert attention into meetings." },
                  { t: "Seal the Deal", d: "High-ticket closing blueprints." }
                ].map((item, i) => (
                  <li key={i} className="flex gap-4 sm:gap-6 group cursor-default">
                    <span className="flex-none w-8 h-8 sm:w-10 h-10 rounded-xl sm:rounded-2xl border border-[#F27D26]/30 flex items-center justify-center text-[10px] sm:text-xs font-mono group-hover:bg-[#F27D26] group-hover:text-white transition-all shadow-lg">0{i+1}</span>
                    <div className="space-y-1">
                      <div className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white group-hover:text-[#F27D26] transition-colors">{item.t}</div>
                      <div className="text-[10px] sm:text-sm text-white/30 group-hover:text-white/50">{item.d}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The Forge - System Visuals */}
      <section id="process" className="py-24 sm:py-48 bg-white/[0.02] relative perspective-2000">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
             initial={{ opacity: 0, y: 30 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             className="text-center mb-16 sm:mb-32"
          >
            <h2 className="text-4xl sm:text-[10rem] font-display font-black leading-[0.9] sm:leading-[0.8] tracking-[0.02em] mb-8 sm:mb-12 uppercase text-glow">
              FORGED IN <br />
              <span className="text-[#F27D26]">DIGITAL IRON.</span>
            </h2>
            <p className="text-white/30 text-sm sm:text-lg uppercase tracking-[0.3em] sm:tracking-[0.5em] font-mono">Precision. Velocity. Retention.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10">
            {[
              {
                icon: <Calendar className="w-6 sm:w-8 h-6 sm:h-8" />,
                title: "7-Day Sprint",
                desc: "The exact day-by-day sequence to go from 'Who?' to 'Send the invoice'."
              },
              {
                icon: <Zap className="w-6 sm:w-8 h-6 sm:h-8" />,
                title: "Velocity Log",
                desc: "A brutal tracking system that exposes exactly why you aren't closing yet."
              },
              {
                icon: <Users className="w-6 sm:w-8 h-6 sm:h-8" />,
                title: "Pipeline CRM",
                desc: "Built for high-volume outreach without losing the human touch."
              },
              {
                icon: <MessageSquare className="w-6 sm:w-8 h-6 sm:h-8" />,
                title: "DM Mastery",
                desc: "Copy-paste frameworks that have already closed $20k+ in editing deals."
              }
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, rotateY: 20, y: 40 }}
                whileInView={{ opacity: 1, rotateY: 0, y: 0 }}
                whileHover={{ y: -10, rotateX: -5 }}
                onClick={() => setActiveModule(item.title)}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                className="group relative p-8 sm:p-12 rounded-[2rem] sm:rounded-[3.5rem] bg-white/5 border border-white/5 hover:bg-[#F27D26]/10 hover:border-[#F27D26]/40 transition-all duration-700 overflow-hidden preserve-3d cursor-pointer"
              >
                <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-[#F27D26]/5 rounded-full blur-3xl group-hover:bg-[#F27D26]/20 transition-all" />
                <div className="w-12 sm:w-20 h-12 sm:h-20 glass-card rounded-xl sm:rounded-[2rem] flex items-center justify-center mb-6 sm:mb-10 text-[#F27D26] group-hover:rotate-[15deg] group-hover:scale-110 transition-all duration-500 border-[#F27D26]/30 shadow-2xl">
                  {item.icon}
                </div>
                <h3 className="text-xl sm:text-3xl font-display font-black mb-4 sm:mb-6 uppercase tracking-tight">{item.title}</h3>
                <p className="text-base sm:text-lg text-white/30 leading-relaxed group-hover:text-white/60 transition-colors font-light">{item.desc}</p>
                <div className="mt-8 sm:mt-10 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center gap-2 text-[#F27D26] font-mono text-[8px] sm:text-[10px] tracking-widest uppercase">
                  EXPLORE MODULE <ChevronRight className="w-4 h-4" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Module Demo Overlay */}
      <AnimatePresence>
        {activeModule && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
          >
            <div onClick={() => setActiveModule(null)} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl glass-card rounded-[2rem] sm:rounded-[4rem] border-white/10 overflow-hidden flex flex-col p-8 sm:p-16 text-center"
            >
              <div className="w-20 h-20 bg-[#F27D26]/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-[#F27D26]/20">
                <Play className="w-8 h-8 text-[#F27D26] fill-[#F27D26]" />
              </div>
              <h3 className="text-3xl font-display font-black text-white uppercase italic mb-4 tracking-tight">DEMO: {activeModule}</h3>
              <p className="text-lg text-white/40 font-light leading-relaxed mb-10 italic">
                {activeModule === "7-Day Sprint" && "A complete breakdown of your first week. No guesswork. Day 1: Deep Research. Day 2: The Scripting Phase. Days 3-7: Outreach Volume."}
                {activeModule === "Velocity Log" && "Stop lying to yourself. This log tracks your raw output against your conversion. If your DMs aren't working, the data reveals the leak instantly."}
                {activeModule === "Pipeline CRM" && "The industrial sorting mechanism. Track every conversation from 'Sent' to 'Meeting' to 'Paid'. Your client journey, managed with surgical precision."}
                {activeModule === "DM Mastery" && "15+ High-Retention scripts. Not based on theory, but on what actually closes $2k+ reatainers in the current market."}
              </p>
              <button 
                onClick={() => setActiveModule(null)}
                className="px-10 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#F27D26] hover:text-white transition-all shadow-2xl"
              >
                CLOSE DEMO
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Testimonials Section */}
      <section className="py-24 sm:py-48 relative overflow-hidden bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <h2 className="text-4xl sm:text-7xl font-display font-black leading-none uppercase tracking-tighter mb-6">
              THE <span className="text-[#F27D26]">FORGED</span> <br />
              COHORT.
            </h2>
            <p className="text-white/30 text-xs sm:text-sm uppercase tracking-[0.4em] font-mono">REAL RESULTS. NO FILLER.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "ALEX V.",
                role: "Editor",
                text: "Signed my first $1,500 retainer on day 5. The scripts are pure gold. I was stuck for 3 months before this system.",
                stats: "+$3,000/mo"
              },
              {
                name: "SARAH L.",
                role: "Short-form Creator",
                text: "The Notion tracker exposed my laziness. Once I hit 20 DMs daily, the meetings just started piling up.",
                stats: "12 Meetings/wk"
              },
              {
                name: "MARCUS K.",
                role: "Freelancer",
                text: "I finally have an engine. Every morning I wake up and just execute. The thinking is gone, only execution remains.",
                stats: "100% Volume"
              }
            ].map((testi, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-10 rounded-[3rem] bg-white/[0.03] border border-white/5 relative group"
              >
                <div className="absolute top-8 right-8 text-[#F27D26] opacity-10 group-hover:opacity-30 transition-opacity">
                  <Sparkles className="w-12 h-12" />
                </div>
                <div className="text-2xl font-display font-bold text-[#F27D26] mb-6">{testi.stats}</div>
                <p className="text-white/50 text-lg font-light leading-relaxed mb-8 italic">"{testi.text}"</p>
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-[#F27D26]/20 flex items-center justify-center font-bold text-[#F27D26] text-xs">
                     {testi.name[0]}
                   </div>
                   <div>
                     <div className="text-xs font-bold text-white uppercase tracking-widest">{testi.name}</div>
                     <div className="text-[10px] text-white/20 uppercase font-mono">{testi.role}</div>
                   </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 sm:py-48 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-20 sm:mb-32">
            <h2 className="text-4xl sm:text-7xl font-display font-black leading-none uppercase tracking-tighter mb-6 italic">
              FREQUENTLY <br />
              <span className="text-[#F27D26]">QUERIED.</span>
            </h2>
            <p className="text-white/30 text-[10px] sm:text-xs uppercase tracking-[0.4em] font-mono">RESOLVING PROTOCOL UNCERTAINTIES.</p>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {[
              {
                q: "IS THIS FOR ABSOLUTE BEGINNERS?",
                a: "Affirmative. The protocol is engineered for velocity at any level. We provide the scripts, the Notion engine, and the exact outreach logic to take you from zero to your first high-ticket retainer."
              },
              {
                q: "DO I NEED A DEEP PORTFOLIO TO START?",
                a: "Negative. Deep reels are for agencies. We focus on 'Proof of Concept' logic that lands clients based on value projection rather than past history. Step 04 of the protocol covers this in detail."
              },
              {
                q: "IS THIS A VIDEO COURSE?",
                a: "Negative. This is an operational engine. While we provide implementation guides, the value is in the high-retention Notion workspace and specialized scripts designed for the current market."
              },
              {
                q: "HOW MUCH TIME DOES IT TAKE DAILY?",
                a: "The core engine requires 60-90 minutes of focused execution: 20 prospects, 20 DMs. Survival of your business depends on this volume. No more, no less."
              },
              {
                q: "IS IT A ONE-TIME PURCHASE?",
                a: "Affirmative. A single forge fee of $9 grants you lifetime access to the version 2.0 system and all future logic updates to the Notion architecture."
              }
            ].map((faq, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group"
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className={`w-full p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] border transition-all flex items-center justify-between text-left group-hover:bg-white/[0.02] ${
                    openFaq === i ? "bg-white/[0.05] border-[#F27D26]/50" : "bg-white/[0.01] border-white/5"
                  }`}
                >
                  <span className={`text-sm sm:text-xl font-bold uppercase tracking-tight transition-colors ${openFaq === i ? "text-[#F27D26]" : "text-white/60 group-hover:text-white"}`}>
                    {faq.q}
                  </span>
                  <div className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition-all ${openFaq === i ? "bg-[#F27D26] border-[#F27D26] rotate-45" : "group-hover:border-[#F27D26]/50"}`}>
                    <Plus className={`w-4 h-4 transition-colors ${openFaq === i ? "text-white" : "text-white/20"}`} />
                  </div>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-8 sm:p-12 text-sm sm:text-lg text-white/40 leading-relaxed font-light italic border-x border-b border-white/5 rounded-b-[2rem] -mt-4 bg-white/[0.01]">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final Forge CTA */}
      <section id="forge" className="py-32 sm:py-64 relative overflow-visible bg-[#050505]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[#F27D26]/5 blur-[200px] rounded-full" />
        </div>

        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
            whileInView={{ opacity: 1, scale: 1, rotateX: 0 }}
            viewport={{ once: true }}
            className="text-center p-8 sm:p-24 rounded-[2.5rem] sm:rounded-[6rem] bg-gradient-to-br from-white/[0.03] to-transparent border border-[#F27D26]/50 shadow-[0_50px_100px_-20px_rgba(242,125,38,0.3)] sm:shadow-[0_100px_200px_-50px_rgba(242,125,38,0.3)] relative preserve-3d"
          >
            <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-6 sm:px-10 py-2 sm:py-4 bg-[#F27D26] text-white text-[8px] sm:text-xs font-black uppercase tracking-[0.4em] rounded-full shadow-[0_10px_20px_rgba(242,125,38,0.5)] sm:shadow-[0_20px_40px_rgba(242,125,38,0.5)] border-2 sm:border-4 border-[#050505]">
              LIMITED PROTOCOL ACCESS
            </div>
            
            <h2 className="text-4xl sm:text-[9rem] font-display font-black mb-6 sm:mb-8 uppercase tracking-tighter italic leading-none">
              READY TO <br />
              <span className="text-[#F27D26] text-glow">FORGE?</span>
            </h2>
            
            <div className="flex items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-16">
              <span className="text-white/20 text-2xl sm:text-5xl line-through font-display font-black">$47</span>
              <div className="flex flex-col items-start leading-none">
                <span className="text-6xl sm:text-[10rem] font-display font-black text-[#F27D26]">$9</span>
                <span className="text-[8px] sm:text-[10px] font-mono text-white/30 tracking-[0.5em] mt-1 sm:mt-2">ONE-TIME ACCESS</span>
              </div>
            </div>

            <motion.button 
              whileHover={agreed ? { 
                scale: 1.02, 
                y: -5,
                boxShadow: "0 40px 80px -20px rgba(242, 125, 38, 0.4)"
              } : {}}
              whileTap={agreed ? { scale: 0.98 } : {}}
              onClick={handlePurchase}
              disabled={!agreed}
              className={`w-full sm:w-auto px-10 sm:px-16 py-6 sm:py-10 rounded-2xl sm:rounded-[3rem] font-black text-xl sm:text-2xl uppercase tracking-[0.1em] sm:tracking-[0.15em] transition-all relative overflow-hidden flex items-center justify-center gap-3 sm:gap-4 mx-auto group shadow-2xl ${
                agreed 
                  ? "bg-white text-black hover:bg-[#F27D26] hover:text-white" 
                  : "bg-white/10 text-white/20 cursor-not-allowed border border-white/5"
              }`}
            >
              {agreed && (
                <motion.div 
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-[#F27D26]/20 to-transparent skew-x-12 pointer-events-none"
                />
              )}
              <span className="relative z-10 flex items-center gap-3 sm:gap-4">
                DEPLOY SYSTEM <ArrowRight className={`w-8 sm:w-10 h-8 sm:h-10 transition-transform ${agreed ? "group-hover:translate-x-3" : ""}`} />
              </span>
            </motion.button>

            <div id="terms-agreement" className="mt-8 flex flex-col items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setAgreed(!agreed)}
                  className={`w-6 h-6 rounded-md border-2 transition-all flex items-center justify-center ${
                    agreed ? "bg-[#F27D26] border-[#F27D26]" : "border-white/20 group-hover:border-[#F27D26]/50"
                  }`}
                >
                  {agreed && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>
                <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-white/40">
                  I accept the <button onClick={() => setShowTerms(true)} className="text-[#F27D26] hover:underline decoration-1 underline-offset-4 pointer-events-auto">Protocol Terms</button>
                </span>
              </label>
              {!agreed && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[8px] font-mono text-[#F27D26]/60 uppercase tracking-[0.2em]"
                >
                  * Protocol activation requires agreement
                </motion.p>
              )}
            </div>
            
            <div className="mt-12 sm:mt-20 pt-10 sm:pt-16 border-t border-white/5 flex flex-col items-center gap-8 sm:gap-10">
              <div className="flex flex-wrap justify-center gap-6 sm:gap-10 opacity-30">
                <div className="flex items-center gap-2 sm:gap-3 grayscale hover:grayscale-0 transition-all cursor-default">
                  <ShieldCheck className="w-6 sm:w-10 h-6 sm:h-10" />
                  <span className="text-[8px] sm:text-[10px] font-mono tracking-widest uppercase truncate max-w-[60px] sm:max-w-none">Secured</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 grayscale hover:grayscale-0 transition-all cursor-default">
                  <Layout className="w-6 sm:w-10 h-6 sm:h-10" />
                  <span className="text-[8px] sm:text-[10px] font-mono tracking-widest uppercase truncate max-w-[60px] sm:max-w-none">Notion V2</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 grayscale hover:grayscale-0 transition-all cursor-default">
                  <MousePointer2 className="w-6 sm:w-10 h-6 sm:h-10" />
                  <span className="text-[8px] sm:text-[10px] font-mono tracking-widest uppercase truncate max-w-[60px] sm:max-w-none">Instant</span>
                </div>
              </div>
              <p className="text-white/20 text-[8px] sm:text-[10px] font-mono uppercase tracking-[0.3em] max-w-sm px-4 sm:px-0">Final purchase grants lifetime access to the protocol and all future logic updates.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Enhanced Industrial Footer */}
      <ContactForm />
      <footer className="py-24 sm:py-32 border-t border-white/5 relative z-10 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-16 md:gap-8 mb-24">
            <div className="md:col-span-2 space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                  <Zap className="w-6 h-6 text-[#F27D26] fill-[#F27D26]" />
                </div>
                <span className="text-2xl font-display font-black tracking-tighter uppercase whitespace-nowrap">FORGE<span className="text-[#F27D26]"> PROTOCOL</span></span>
              </div>
              <p className="max-w-sm text-white/30 text-sm leading-relaxed font-light">
                The definitive industrial engine for high-velocity video editing careers. Built by practitioners, for practitioners. Stop waiting, start forging.
              </p>
              <div className="flex gap-4">
                {['Twitter', 'Instagram', 'Discord'].map((platform) => (
                  <a key={platform} href="#" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 hover:text-[#F27D26] hover:border-[#F27D26]/30 transition-all">
                    <MousePointer2 className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#F27D26] mb-8 font-black">Architecture</h4>
              <ul className="space-y-4 text-xs font-mono uppercase tracking-widest text-white/20">
                <li><a href="#about" className="hover:text-white transition-colors">Manifesto</a></li>
                <li><a href="#inside" className="hover:text-white transition-colors">The Engine</a></li>
                <li><a href="#process" className="hover:text-white transition-colors">Protocol</a></li>
                <li><a href="#forge" className="hover:text-white transition-colors">Access</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#F27D26] mb-8 font-black">Legal</h4>
              <ul className="space-y-4 text-xs font-mono uppercase tracking-widest text-white/20">
                <li><button onClick={() => setShowTerms(true)} className="hover:text-white transition-colors text-left uppercase">Terms of Use</button></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support Protocol</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-white/5 text-[10px] font-mono uppercase tracking-[0.5em] font-light text-center md:text-left">
              © 2026 CLIENT FORGE PROTOCOL V2.0.0. ALL RIGHTS RESERVED.
            </div>
            <div className="flex gap-8 text-[8px] font-mono uppercase tracking-[0.3em] text-white/10">
              <span>FORGED IN AI STUDIO</span>
              <span>HOSTED BY GOOGLE</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Terms Overlay */}
      <AnimatePresence>
        {showTerms && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
          >
            <div onClick={() => setShowTerms(false)} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
            
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden glass-card rounded-[2rem] sm:rounded-[4rem] border-white/10 flex flex-col"
            >
              <div className="p-8 sm:p-12 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-2xl font-display font-black text-[#F27D26] uppercase italic tracking-[0.1em]">PROTOCOL TERMS</h3>
                <button onClick={() => setShowTerms(false)} className="p-3 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all">
                  <Lock className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 sm:p-12 overflow-y-auto text-sm sm:text-base font-light text-white/40 leading-relaxed space-y-8 scrollbar-thin">
                <section className="space-y-4">
                  <h4 className="text-white uppercase font-black text-xs font-mono tracking-widest">01. THE AGREEMENT</h4>
                  <p>By accessing the Forge Protocol, you agree to deploy the system as intended. This is an industrial-grade logic engine, not a theoretical framework. You acknowledge that your results depend on your execution speed and consistency.</p>
                </section>
                
                <section className="space-y-4">
                  <h4 className="text-white uppercase font-black text-xs font-mono tracking-widest">02. INTELLECTUAL PROPERTY</h4>
                  <p>The 20 DM System and Forge Protocol are licensed for individual use. Redistribution, reselling, or public sharing of the Notion template architecture is strictly prohibited and protected by digital watermarking.</p>
                </section>
                
                <section className="space-y-4">
                  <h4 className="text-white uppercase font-black text-xs font-mono tracking-widest">04. DISCLAIMER</h4>
                  <p>Every effort has been made to accurately represent this product and its potential. Even though this industry is one of the few where one can write their own check in terms of earnings, there is no guarantee that you will earn any money using the techniques and ideas in these materials.</p>
                </section>

                <section className="space-y-4 pt-4 border-t border-white/5">
                   <h4 className="text-[#F27D26] uppercase font-black text-xs font-mono tracking-widest">PROTOCOL DIRECTIVES</h4>
                   <ul className="space-y-4 text-xs">
                      <li className="flex gap-3">
                         <span className="text-[#F27D26] shrink-0">✓</span>
                         <span>You must verify 20 prospects per day.</span>
                      </li>
                      <li className="flex gap-3">
                         <span className="text-[#F27D26] shrink-0">✓</span>
                         <span>You must follow up a minimum of 3 times before archiving.</span>
                      </li>
                      <li className="flex gap-3">
                         <span className="text-[#F27D26] shrink-0">✓</span>
                         <span>You must maintain a minimum reply-to-meeting conversion of 15%.</span>
                      </li>
                   </ul>
                </section>
              </div>

              <div className="p-8 sm:p-12 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => { setShowTerms(false); setAgreed(true); }}
                  className="px-8 py-4 bg-[#F27D26] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#FF4D00] transition-colors shadow-2xl"
                >
                  I AGREE & UNDERSTAND
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileHover={{ scale: 1.1, y: -5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-8 right-8 z-[100] w-14 h-14 sm:w-16 sm:h-16 bg-[#F27D26] text-white rounded-2xl flex items-center justify-center shadow-[0_20px_50px_rgba(242,125,38,0.4)] border border-white/10 group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <ChevronUp className="w-6 h-6 sm:w-8 sm:h-8 relative z-10 transition-transform group-hover:-translate-y-1" />
          </motion.button>
        )}
      </AnimatePresence>
      <SupportChat />
    </div>
  );
}
