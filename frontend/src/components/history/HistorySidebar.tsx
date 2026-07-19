import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare,
  Trash2,
  Plus,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Pin,
  PanelLeftClose,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getApiUrl } from '../../config';

interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
  folder_id?: string | null;
  is_pinned?: boolean;
}

interface ChatFolder {
  folder_id: string;
  name: string;
  is_pinned: boolean;
  sort_order: number;
  created_at: string;
  session_count: number;
}

interface HistorySidebarProps {
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  refreshTrigger?: number;
}

type MenuTarget =
  | { kind: 'session'; id: string }
  | { kind: 'folder'; id: string }
  | null;

const COLLAPSED_W = 48;
const EXPANDED_W = 268;
const LEAVE_DELAY_MS = 280;

export default function HistorySidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  refreshTrigger = 0,
}: HistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuTarget>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renaming, setRenaming] = useState<{ kind: 'folder' | 'session'; id: string; value: string } | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const keepOpenRef = useRef(false);

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const scheduleCollapse = () => {
    clearLeaveTimer();
    leaveTimer.current = window.setTimeout(() => {
      if (keepOpenRef.current) return;
      // 正在输入新建/重命名时不收起
      if (creatingFolder || renaming) return;
      setExpanded(false);
      setMenu(null);
    }, LEAVE_DELAY_MS);
  };

  const handleEnter = () => {
    clearLeaveTimer();
    setExpanded(true);
  };

  const handleLeave = () => {
    scheduleCollapse();
  };

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, fRes] = await Promise.all([
        fetch(`${getApiUrl()}/history/sessions`),
        fetch(`${getApiUrl()}/history/folders`),
      ]);
      if (sRes.ok) setSessions(await sRes.json());
      if (fRes.ok) setFolders(await fRes.json());
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshTrigger]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => () => clearLeaveTimer(), []);

  const sessionsByFolder = useMemo(() => {
    const map: Record<string, ChatSession[]> = {};
    for (const s of sessions) {
      const fid = s.folder_id || '';
      if (!fid) continue;
      (map[fid] ||= []).push(s);
    }
    return map;
  }, [sessions]);

  const recentSessions = useMemo(
    () => sessions.filter((s) => !s.folder_id),
    [sessions]
  );

  const toggleFolder = (id: string) => {
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteSession = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenu(null);
    try {
      const res = await fetch(`${getApiUrl()}/history/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.session_id !== id));
        if (currentSessionId === id) onNewSession();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${getApiUrl()}/history/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const folder = await res.json();
        setFolders((prev) => [...prev, folder]);
        setOpenFolders((prev) => ({ ...prev, [folder.folder_id]: true }));
        setPinnedOpen(true);
      }
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      setCreatingFolder(false);
      setNewFolderName('');
      keepOpenRef.current = false;
    }
  };

  const handleDeleteFolder = async (id: string) => {
    setMenu(null);
    try {
      const res = await fetch(`${getApiUrl()}/history/folders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFolders((prev) => prev.filter((f) => f.folder_id !== id));
        setSessions((prev) =>
          prev.map((s) => (s.folder_id === id ? { ...s, folder_id: null } : s))
        );
      }
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const patchSession = async (
    id: string,
    body: { title?: string; folder_id?: string | null; clear_folder?: boolean; is_pinned?: boolean }
  ) => {
    const res = await fetch(`${getApiUrl()}/history/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated: ChatSession = await res.json();
    setSessions((prev) => prev.map((s) => (s.session_id === id ? { ...s, ...updated } : s)));
    return updated;
  };

  const patchFolder = async (id: string, body: { name?: string }) => {
    const res = await fetch(`${getApiUrl()}/history/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated: ChatFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.folder_id === id ? { ...f, ...updated } : f)));
    return updated;
  };

  const commitRename = async () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    try {
      if (value) {
        if (renaming.kind === 'folder') await patchFolder(renaming.id, { name: value });
        else await patchSession(renaming.id, { title: value });
      }
    } catch (err) {
      console.error('Rename failed:', err);
    } finally {
      setRenaming(null);
      keepOpenRef.current = false;
    }
  };

  const moveSessionToFolder = async (sessionId: string, folderId: string | null) => {
    setMenu(null);
    try {
      if (folderId) {
        await patchSession(sessionId, { folder_id: folderId });
        setOpenFolders((prev) => ({ ...prev, [folderId]: true }));
        setPinnedOpen(true);
      } else {
        await patchSession(sessionId, { clear_folder: true });
      }
    } catch (err) {
      console.error('Move session failed:', err);
    }
  };

  const SessionRow = ({
    session,
    indented = false,
  }: {
    session: ChatSession;
    indented?: boolean;
  }) => {
    const active = currentSessionId === session.session_id;
    const isRenaming = renaming?.kind === 'session' && renaming.id === session.session_id;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (!isRenaming) onSelectSession(session.session_id);
          }}
          className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors group ${
            indented ? 'pl-7' : ''
          } ${
            active
              ? 'bg-white/10 text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
          }`}
        >
          <MessageSquare size={14} className="shrink-0 opacity-70" />
          {isRenaming ? (
            <input
              autoFocus
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              onBlur={() => commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenaming(null);
                  keepOpenRef.current = false;
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-black/30 border border-[var(--accent-cyan)]/40 rounded px-1.5 py-0.5 text-xs outline-none"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-[13px]">{session.title || 'New Chat'}</span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(
                menu?.kind === 'session' && menu.id === session.session_id
                  ? null
                  : { kind: 'session', id: session.session_id }
              );
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 shrink-0"
          >
            <MoreHorizontal size={14} />
          </span>
        </button>

        {menu?.kind === 'session' && menu.id === session.session_id && (
          <div className="absolute right-1 top-8 z-50 w-44 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl py-1 text-xs">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-left"
              onClick={() => {
                keepOpenRef.current = true;
                setRenaming({ kind: 'session', id: session.session_id, value: session.title || '' });
                setMenu(null);
              }}
            >
              <Pencil size={12} /> 重命名
            </button>
            {folders.length > 0 && (
              <div className="border-t border-[var(--border-color)] my-1" />
            )}
            {folders.map((f) => (
              <button
                key={f.folder_id}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-left"
                onClick={() => moveSessionToFolder(session.session_id, f.folder_id)}
              >
                <Folder size={12} /> 移到「{f.name}」
              </button>
            ))}
            {session.folder_id && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-left"
                onClick={() => moveSessionToFolder(session.session_id, null)}
              >
                <PanelLeftClose size={12} /> 移出文件夹
              </button>
            )}
            <div className="border-t border-[var(--border-color)] my-1" />
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 text-red-400 text-left"
              onClick={() => handleDeleteSession(session.session_id)}
            >
              <Trash2 size={12} /> 删除
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.aside
      ref={rootRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      animate={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl"
      style={{ width: COLLAPSED_W }}
    >
      {/* 顶栏 */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-2.5 border-b border-[var(--border-color)]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-2 rounded-lg hover:bg-white/10 text-[var(--text-secondary)] shrink-0"
          title={expanded ? '收起' : '展开'}
        >
          <PanelLeftClose size={18} className={expanded ? '' : 'rotate-180'} />
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="text-sm font-semibold text-[var(--text-primary)] truncate"
            >
              会话
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 新建会话 */}
      <div className="p-2 shrink-0">
        <button
          type="button"
          onClick={onNewSession}
          className={`w-full flex items-center gap-2 rounded-lg border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] transition-colors ${
            expanded ? 'px-3 py-2 justify-start' : 'p-2.5 justify-center'
          }`}
          title="新建会话"
        >
          <Plus size={16} className="shrink-0" />
          {expanded && <span className="text-sm whitespace-nowrap">新建会话</span>}
        </button>
      </div>

      {/* 折叠态仅显示图标提示 */}
      {!expanded && (
        <div className="flex-1 flex flex-col items-center gap-3 pt-2 text-[var(--text-secondary)]">
          <Folder size={18} className="opacity-60" />
          <MessageSquare size={18} className="opacity-60" />
        </div>
      )}

      {/* 展开内容 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
              {/* 已固定 / 文件夹 */}
              <section>
                <div className="flex items-center justify-between px-1 mb-1">
                  <button
                    type="button"
                    onClick={() => setPinnedOpen((v) => !v)}
                    className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]/80 hover:text-[var(--text-secondary)]"
                  >
                    {pinnedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Pin size={11} />
                    已固定
                  </button>
                  <button
                    type="button"
                    title="新建文件夹"
                    onClick={() => {
                      keepOpenRef.current = true;
                      setCreatingFolder(true);
                      setPinnedOpen(true);
                      setNewFolderName('');
                    }}
                    className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)]"
                  >
                    <FolderPlus size={14} />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {pinnedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-0.5"
                    >
                      {creatingFolder && (
                        <div className="flex items-center gap-1 px-1 py-1">
                          <FolderPlus size={14} className="text-[var(--accent-cyan)] shrink-0" />
                          <input
                            autoFocus
                            value={newFolderName}
                            placeholder="文件夹名称"
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onBlur={() => {
                              if (!newFolderName.trim()) {
                                setCreatingFolder(false);
                                keepOpenRef.current = false;
                              } else {
                                handleCreateFolder();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateFolder();
                              if (e.key === 'Escape') {
                                setCreatingFolder(false);
                                setNewFolderName('');
                                keepOpenRef.current = false;
                              }
                            }}
                            className="flex-1 min-w-0 bg-black/30 border border-[var(--accent-cyan)]/40 rounded px-1.5 py-1 text-xs outline-none"
                          />
                        </div>
                      )}

                      {folders.length === 0 && !creatingFolder && (
                        <p className="px-2 py-1.5 text-[11px] text-[var(--text-secondary)]/60">
                          暂无文件夹，点击 + 创建
                        </p>
                      )}

                      {folders.map((folder) => {
                        const open = openFolders[folder.folder_id] ?? true;
                        const kids = sessionsByFolder[folder.folder_id] || [];
                        const isRenaming =
                          renaming?.kind === 'folder' && renaming.id === folder.folder_id;
                        return (
                          <div key={folder.folder_id} className="relative">
                            <button
                              type="button"
                              onClick={() => toggleFolder(folder.folder_id)}
                              className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] group"
                            >
                              {open ? (
                                <ChevronDown size={12} className="shrink-0 opacity-70" />
                              ) : (
                                <ChevronRight size={12} className="shrink-0 opacity-70" />
                              )}
                              {open ? (
                                <FolderOpen size={14} className="shrink-0 text-amber-400/90" />
                              ) : (
                                <Folder size={14} className="shrink-0 text-amber-400/90" />
                              )}
                              {isRenaming ? (
                                <input
                                  autoFocus
                                  value={renaming.value}
                                  onChange={(e) =>
                                    setRenaming({ ...renaming, value: e.target.value })
                                  }
                                  onBlur={() => commitRename()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename();
                                    if (e.key === 'Escape') {
                                      setRenaming(null);
                                      keepOpenRef.current = false;
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 min-w-0 bg-black/30 border border-[var(--accent-cyan)]/40 rounded px-1.5 py-0.5 text-xs outline-none"
                                />
                              ) : (
                                <span className="flex-1 min-w-0 truncate text-[13px] text-left">
                                  {folder.name}
                                </span>
                              )}
                              <span className="text-[10px] opacity-50 tabular-nums">
                                {kids.length}
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenu(
                                    menu?.kind === 'folder' && menu.id === folder.folder_id
                                      ? null
                                      : { kind: 'folder', id: folder.folder_id }
                                  );
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10"
                              >
                                <MoreHorizontal size={14} />
                              </span>
                            </button>

                            {menu?.kind === 'folder' && menu.id === folder.folder_id && (
                              <div className="absolute right-1 top-8 z-50 w-36 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl py-1 text-xs">
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-left"
                                  onClick={() => {
                                    keepOpenRef.current = true;
                                    setRenaming({
                                      kind: 'folder',
                                      id: folder.folder_id,
                                      value: folder.name,
                                    });
                                    setMenu(null);
                                  }}
                                >
                                  <Pencil size={12} /> 重命名
                                </button>
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 text-red-400 text-left"
                                  onClick={() => handleDeleteFolder(folder.folder_id)}
                                >
                                  <Trash2 size={12} /> 删除
                                </button>
                              </div>
                            )}

                            <AnimatePresence initial={false}>
                              {open && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  {kids.length === 0 ? (
                                    <p className="pl-8 pr-2 py-1 text-[11px] text-[var(--text-secondary)]/50">
                                      空文件夹
                                    </p>
                                  ) : (
                                    kids.map((s) => (
                                      <SessionRow key={s.session_id} session={s} indented />
                                    ))
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* 最近 */}
              <section>
                <div className="px-2 mb-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]/80">
                  最近
                </div>
                <div className="space-y-0.5">
                  {recentSessions.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-[var(--text-secondary)]/60">
                      暂无会话
                    </p>
                  ) : (
                    recentSessions.map((s) => (
                      <SessionRow key={s.session_id} session={s} />
                    ))
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
