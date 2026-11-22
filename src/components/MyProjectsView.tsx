import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { CheckCircle2, Lock, MessageSquare, Send, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { t } from '../lib/i18n';
import { FurnitureConfig, Language, ProjectMessage, UserProject } from '../types/furniture';

interface MyProjectsViewProps {
  lang: Language;
  user: User | null;
  onSignInGoogle: () => Promise<void>;
  onLoadProjectInStudio: (project: UserProject) => void;
}

export const MyProjectsView: React.FC<MyProjectsViewProps> = ({
  lang,
  user,
  onSignInGoogle,
  onLoadProjectInStudio,
}) => {
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [crmProjects, setCrmProjects] = useState<UserProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) {
      setCrmProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tok = await user.getIdToken();
        const resp = await fetch('/api/projects/my', {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (resp.ok && !cancelled) {
          const data = (await resp.json()) as { projects?: UserProject[] };
          setCrmProjects(data.projects || []);
        }
      } catch (err) {
        console.warn('Could not load CRM offers:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const q = query(
      collection(db, 'user_projects'),
      where('ownerId', '==', user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const listWithTime = snap.docs.map((d) => {
          const data = d.data();
          const updatedAtMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
          const proj: UserProject = {
            id: d.id,
            projectCode: data.projectCode,
            ownerId: data.ownerId,
            ownerEmail: data.ownerEmail,
            ownerName: data.ownerName,
            customerPhone: data.customerPhone,
            title: data.title,
            config: data.config as FurnitureConfig,
            calculatedPriceEur: data.calculatedPriceEur,
            status: data.status,
            initialQuestion: data.initialQuestion,
            adminNote: data.adminNote,
            publishedToTemplates: data.publishedToTemplates,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '',
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : '',
          };
          return { proj, updatedAtMs };
        });
        listWithTime.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        const list = listWithTime.map((item) => item.proj);
        setProjects(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'user_projects'),
    );
    return () => unsub();
  }, [user]);

  const mergedProjects = projects.map((p) => {
    const crmMatch = crmProjects.find((c) => c.projectCode === p.projectCode || c.id === p.id);
    if (!crmMatch) return p;
    const isCrmAdvanced =
      crmMatch.status === 'approved' ||
      crmMatch.status === 'in_production' ||
      crmMatch.status === 'ready_for_install' ||
      crmMatch.status === 'under_review';
    return {
      ...p,
      status: isCrmAdvanced ? crmMatch.status : p.status,
      adminNote: crmMatch.adminNote || p.adminNote,
      crmMessages: crmMatch.crmMessages || [],
    };
  });

  const selectedProject =
    mergedProjects.find((p) => p.id === selectedId) || mergedProjects[0] || null;

  useEffect(() => {
    if (!user || !selectedProject) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'user_projects', selectedProject.id, 'messages'),
      where('projectOwnerId', '==', user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgsWithTime = snap.docs.map((d) => {
          const data = d.data();
          const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
          const msg: ProjectMessage = {
            id: d.id,
            projectOwnerId: data.projectOwnerId,
            senderId: data.senderId,
            senderRole: data.senderRole,
            senderName: data.senderName,
            text: data.text,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('bg-BG') : '',
          };
          return { msg, createdAtMs };
        });
        msgsWithTime.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setMessages(msgsWithTime.map((item) => item.msg));
      },
      (error) =>
        handleFirestoreError(
          error,
          OperationType.LIST,
          `user_projects/${selectedProject.id}/messages`,
        ),
    );
    return () => unsub();
  }, [user, selectedProject?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject || !replyText.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'user_projects', selectedProject.id, 'messages'), {
        projectOwnerId: user.uid,
        senderId: user.uid,
        senderRole: 'client',
        senderName: user.displayName || user.email || 'Клиент',
        text: replyText.trim(),
        createdAt: serverTimestamp(),
      });
      setReplyText('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `user_projects/${selectedProject.id}/messages`,
      );
    } finally {
      setSending(false);
    }
  };

  const handleDeleteDraft = async (proj: UserProject) => {
    if (proj.status !== 'draft') return;
    try {
      await deleteDoc(doc(db, 'user_projects', proj.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `user_projects/${proj.id}`);
    }
  };

  const statusLabel = (s: UserProject['status']) => {
    if (s === 'ready_for_install') return t(lang, 'statusReadyForInstall');
    if (s === 'in_production') return t(lang, 'statusInProduction');
    if (s === 'approved') return t(lang, 'statusApproved');
    if (s === 'under_review') return t(lang, 'statusReview');
    if (s === 'inquiry_sent') return t(lang, 'statusSent');
    return t(lang, 'statusDraft');
  };

  if (!user) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-semibold text-zinc-900">
          {t(lang, 'myProjectsTitle')}
        </h2>
        <p className="mt-3 text-sm text-zinc-600 max-w-md mx-auto">
          {t(lang, 'myProjectsNeedLogin')}
        </p>
        <button
          type="button"
          onClick={onSignInGoogle}
          className="mt-6 rounded-lg bg-[#18181B] px-6 py-3 text-sm font-semibold text-white hover:bg-[#B47B44] transition-colors"
        >
          {t(lang, 'signInGoogle')}
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1280px] px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-zinc-900">
            {t(lang, 'myProjectsTitle')}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
        </div>
      </div>

      {mergedProjects.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          {lang === 'bg'
            ? 'Все още нямате запазени проекти. Конфигурирайте мебел в 3D студиото и я запазете в профила си.'
            : 'No saved projects yet. Design a piece in the 3D Studio and save it to your profile.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Saved projects list */}
          <div className="lg:col-span-5 space-y-3">
            {mergedProjects.map((p) => {
              const active = selectedProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                    active
                      ? 'border-[#B47B44] bg-white shadow-sm'
                      : 'border-zinc-200 bg-white/60 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono-tabular text-[#B47B44] font-semibold">
                        {p.projectCode} · {statusLabel(p.status)}
                      </div>
                      <h3 className="mt-0.5 text-base font-semibold text-zinc-900">{p.title}</h3>
                      <div className="mt-1 text-xs text-zinc-500 font-mono-tabular">
                        {p.config.widthCm} × {p.config.heightCm} × {p.config.depthCm} cm
                        {p.config.layoutShape === 'l_shape' ? ` + ${p.config.wingWidthCm} cm` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-tabular text-base font-semibold text-zinc-900">
                        {p.calculatedPriceEur.toLocaleString('bg-BG')} €
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoadProjectInStudio(p);
                      }}
                      className="text-xs font-semibold text-zinc-900 hover:text-[#B47B44]"
                    >
                      {lang === 'bg' ? 'Отвори в 3D студиото →' : 'Open in 3D Studio →'}
                    </button>
                    {p.status === 'draft' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(p);
                        }}
                        className="text-zinc-400 hover:text-red-600"
                        title={lang === 'bg' ? 'Изтрий чернова' : 'Delete draft'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Consultation thread & Approval Gate */}
          {selectedProject && (
            <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-6 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                  <div>
                    <span className="font-mono-tabular text-xs font-semibold text-[#B47B44]">
                      {selectedProject.projectCode}
                    </span>
                    <h3 className="text-xl font-semibold text-zinc-900">{selectedProject.title}</h3>
                  </div>
                  <div className="font-mono-tabular text-lg font-semibold text-zinc-900">
                    {selectedProject.calculatedPriceEur.toLocaleString('bg-BG')} €
                  </div>
                </div>

                {/* Anti-theft status banner */}
                {selectedProject.status === 'approved' ||
                selectedProject.status === 'in_production' ||
                selectedProject.status === 'ready_for_install' ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        {statusLabel(selectedProject.status)} — {t(lang, 'approvedUnlockNote')}
                      </p>
                      {selectedProject.adminNote && (
                        <p className="mt-1 text-emerald-800">{selectedProject.adminNote}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                    <Lock className="h-4 w-4 shrink-0 text-[#B47B44] mt-0.5" />
                    <span>{t(lang, 'lockedReleaseNote')}</span>
                  </div>
                )}

                {/* Messages */}
                <div className="mt-5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 mb-3">
                    <MessageSquare className="h-3.5 w-3.5 text-[#B47B44]" />
                    <span>
                      {lang === 'bg' ? 'Кореспонденция по проекта' : 'Project Discussion'}
                    </span>
                  </div>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {(() => {
                      const combined = [
                        ...messages.map((m) => ({
                          id: m.id,
                          senderRole: m.senderRole,
                          senderName: m.senderName,
                          text: m.text,
                          createdAt: m.createdAt,
                        })),
                        ...(selectedProject.crmMessages || []).filter(
                          (cm) => !messages.some((m) => m.text === cm.text),
                        ),
                      ];
                      if (combined.length === 0) {
                        return (
                          <p className="text-xs text-zinc-400 py-6 text-center">
                            {lang === 'bg'
                              ? 'Няма съобщения. Напишете въпрос до майстора по-долу.'
                              : 'No messages yet. Write a question to the workshop below.'}
                          </p>
                        );
                      }
                      return combined.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg p-3 text-xs ${
                            m.senderRole === 'admin'
                              ? 'bg-[#B47B44]/10 border border-[#B47B44]/25 text-zinc-900 ml-6'
                              : 'bg-zinc-100 text-zinc-800 mr-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                            <span className="font-semibold text-zinc-800">{m.senderName}</span>
                            <span>{m.createdAt}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2 border-t border-zinc-100 pt-4">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t(lang, 'questionPlaceholder')}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B47B44] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{lang === 'bg' ? 'Изпрати' : 'Send'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
