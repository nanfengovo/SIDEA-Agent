import React, { useEffect, useState } from 'react';
import { MessageSquare, Trash2, Plus, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
}

interface HistorySidebarProps {
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export default function HistorySidebar({ currentSessionId, onSelectSession, onNewSession }: HistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/history/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`http://localhost:8000/api/history/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== id));
        if (currentSessionId === id) {
          onNewSession();
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  return (
    <div className={`fixed left-0 top-0 bottom-0 z-50 flex ${isOpen ? 'w-64' : 'w-12'} transition-all duration-300`}>
      <div className="h-full w-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shadow-xl overflow-hidden backdrop-blur-xl">
        <div className="h-16 flex items-center px-3 border-b border-[var(--border-color)] justify-between shrink-0">
          {isOpen && <h2 className="text-sm font-bold text-[var(--text-primary)] m-0">会话历史</h2>}
          <button onClick={() => setIsOpen(!isOpen)} className="p-1.5 rounded hover:bg-white/10 text-[var(--text-secondary)] transition-colors">
            <Menu size={20} />
          </button>
        </div>
        
        {isOpen && (
          <>
            <div className="p-3 shrink-0">
              <button 
                onClick={onNewSession}
                className="w-full flex items-center justify-center gap-2 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 py-2 rounded-lg transition-colors text-sm"
              >
                <Plus size={16} />
                <span>新建会话</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <AnimatePresence>
                {sessions.map(s => (
                  <motion.div 
                    key={s.session_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <button 
                      onClick={() => onSelectSession(s.session_id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors group ${currentSessionId === s.session_id ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <MessageSquare size={16} className="shrink-0" />
                        <span className="text-sm truncate">{s.title}</span>
                      </div>
                      <div 
                        onClick={(e) => handleDelete(s.session_id, e)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded hover:bg-white/10 transition-all shrink-0"
                      >
                        <Trash2 size={14} />
                      </div>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
