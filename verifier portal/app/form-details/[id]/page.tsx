'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Link from 'next/link';
import {
  CheckCircle, XCircle, CornerDownLeft, Download, FileText, Image as ImageIcon,
  ChevronLeft, User, Mail, Building, Calendar, Clock, Send, ArrowRight,
  Shield, Check, AlertCircle, Loader2, AlertTriangle, Hash,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type DisplayStatus = 'Accepted' | 'Pending' | 'Rejected' | 'Expired';
type WorkflowStatus = 'Completed' | 'Current' | 'Pending';

interface WorkflowStage {
  level: number;
  verifierId: string;
  verifierName: string;
  role: string;
  department: string;
  status: WorkflowStatus;
  actionStatus: 'Approved' | 'Rejected' | null;
  remark: string | null;
  date: string | null;
}

interface Field {
  label: string;
  value: string;
  type: string;
}

interface VerifierContext {
  verifierId: string | null;
  level: number | null;
  isCurrentVerifier: boolean;
  isLastVerifier: boolean;
  canAct: boolean;
  nextVerifier: WorkflowStage | null;
}

interface DetailsData {
  submission: {
    id: string;
    status: DisplayStatus;
    overallStatus: string;
    currentLevel: number;
    totalLevels: number;
    submissionDate: string;
  };
  student: {
    id: string;
    name: string;
    email: string;
  };
  form: {
    id: number;
    title: string;
    description: string;
    deadline: string;
    isExpired: boolean;
  };
  fields: Field[];
  workflow: WorkflowStage[];
  verifierContext: VerifierContext;
}

const formatDeadline = (date?: string | null) => {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ─── Modals ────────────────────────────────────────────────────────────────────

function RejectModal({ onClose, onSubmit, loading }: {
  onClose: () => void;
  onSubmit: (r: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEE2E2' }}>
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Reject this Form</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>The student will be notified with your reason.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="Enter rejection reason (required)..."
          className="form-input resize-none mb-4"
          disabled={loading}
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-outline" disabled={loading}>Cancel</button>
          <button
            onClick={() => reason.trim() && onSubmit(reason)}
            className="btn-danger"
            disabled={!reason.trim() || loading}
            style={{ opacity: reason.trim() && !loading ? 1 : 0.5 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function SendBackModal({ onClose, onSubmit, loading }: {
  onClose: () => void;
  onSubmit: (r: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFFBEB' }}>
            <CornerDownLeft className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Send Back for Correction</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>The form will be returned to the student for corrections.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="Describe required corrections (required)..."
          className="form-input resize-none mb-4"
          disabled={loading}
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-outline" disabled={loading}>Cancel</button>
          <button
            onClick={() => reason.trim() && onSubmit(reason)}
            className="btn-warning"
            disabled={!reason.trim() || loading}
            style={{ opacity: reason.trim() && !loading ? 1 : 0.5 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
            Send Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage colors ──────────────────────────────────────────────────────────────

const stageColors: Record<WorkflowStatus, { bg: string; border: string; icon: string; text: string }> = {
  Completed: { bg: '#F0FDF4', border: '#22C55E', icon: '#22C55E', text: '#065F46' },
  Current: { bg: '#EFF6FF', border: '#3B82F6', icon: '#3B82F6', text: '#1D4ED8' },
  Pending: { bg: 'var(--bg)', border: 'var(--border)', icon: '#94A3B8', text: 'var(--text-muted)' },
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FormDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<DetailsData | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [rejectModal, setRejectModal] = useState(false);
  const [sendBackModal, setSendBackModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);

  // ── Fetch submission details ────────────────────────────────────────────────
  const fetchDetails = useCallback(async () => {
    try {
      setLoadingPage(true);
      setPageError(null);
      const res = await fetch(`/api/submissions/${id}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to load submission');
      }
      setData(await res.json());
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoadingPage(false);
    }
  }, [id, router]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = (msg: string, color = '#22C55E') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Action caller ───────────────────────────────────────────────────────────
  const callAction = async (action: 'approve' | 'reject' | 'sendback', remark?: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, remark }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Action failed');

      if (action === 'approve') {
        const isLast = data?.verifierContext.isLastVerifier;
        showToast(isLast ? 'Form finally approved! Student will be notified.' : 'Form forwarded to next verifier.');
      } else if (action === 'reject') {
        showToast('Form rejected. Student has been notified.', '#EF4444');
      } else {
        showToast('Form sent back for correction.');
      }

      await fetchDetails();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', '#EF4444');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => callAction('approve');
  const handleReject = (remark: string) => { setRejectModal(false); callAction('reject', remark); };
  const handleSendBack = (remark: string) => { setSendBackModal(false); callAction('sendback', remark); };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loadingPage) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>Loading submission...</span>
        </div>
      </DashboardLayout>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (pageError || !data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{pageError ?? 'No data found'}</p>
          <button onClick={fetchDetails} className="btn-outline text-sm">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const { submission, student, form, fields, workflow, verifierContext } = data;
  const { canAct, isLastVerifier, isCurrentVerifier, nextVerifier } = verifierContext;
  const isFinished = submission.overallStatus !== 'Pending';

  // ── Progress calculation ────────────────────────────────────────────────────
  // Only count levels where status is 'Completed' AND actionStatus is 'Approved'.
  // Starts at 0% when nothing is approved yet (e.g. level 1 is still pending).
  const acceptedLevels = workflow.filter(
    s => s.status === 'Completed' && s.actionStatus === 'Approved'
  ).length;
  const progressPercent = submission.totalLevels > 0
    ? Math.round((acceptedLevels / submission.totalLevels) * 100)
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-lg"
          style={{ background: `linear-gradient(135deg, ${toast.color}, ${toast.color}cc)` }}
        >
          ✓ {toast.msg}
        </div>
      )}

      {/* Modals */}
      {rejectModal && <RejectModal onClose={() => setRejectModal(false)} onSubmit={handleReject} loading={actionLoading} />}
      {sendBackModal && <SendBackModal onClose={() => setSendBackModal(false)} onSubmit={handleSendBack} loading={actionLoading} />}

      {/* Back nav */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Form Details</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{form.title}</h2>
          <p className="text-sm mt-1 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <span>{student.name}</span>
            <span>·</span>
            <span>{student.email}</span>
            <span>·</span>
            <span className={`badge badge-${submission.status.toLowerCase()}`}>{submission.status}</span>
          </p>
        </div>

        {/* Action buttons */}
        {!isFinished && canAct && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setSendBackModal(true)} className="btn-warning" disabled={actionLoading}>
              <CornerDownLeft className="w-4 h-4" /> Send Back
            </button>
            <button onClick={() => setRejectModal(true)} className="btn-danger" disabled={actionLoading}>
              <XCircle className="w-4 h-4" /> Reject
            </button>
            {isLastVerifier ? (
              <button onClick={handleApprove} className="btn-success" disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Final Approve
              </button>
            ) : (
              <button onClick={handleApprove} className="btn-primary" disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {nextVerifier?.verifierName || 'Next Verifier'}
              </button>
            )}
          </div>
        )}

        {/* Not your turn notice */}
        {!isFinished && !canAct && isCurrentVerifier && (
          <div className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D' }}>
            <Clock className="w-4 h-4 inline mr-1" /> Awaiting your level — not yet reached
          </div>
        )}

        {/* Not in chain notice */}
        {!isFinished && !isCurrentVerifier && !canAct && (
          <div className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <Shield className="w-4 h-4 inline mr-1" /> View only
          </div>
        )}

        {/* Final state badges */}
        {submission.overallStatus === 'Approved' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ background: '#F0FDF4', color: '#22C55E', border: '1px solid #86EFAC' }}>
            <CheckCircle className="w-4 h-4" /> Approved
          </div>
        )}
        {submission.overallStatus === 'Rejected' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ background: '#FFF5F5', color: '#EF4444', border: '1px solid #FCA5A5' }}>
            <XCircle className="w-4 h-4" /> Rejected
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ── Left col ─────────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Verification Timeline */}
          <div className="content-card p-6">
            <h3 className="font-bold text-base mb-6 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Shield style={{ width: 18, height: 18, color: '#3B82F6' }} />
              Verification Workflow
            </h3>
            <div className="space-y-0">
              {workflow.map((stage, i) => {
                const c = stageColors[stage.status];
                const isLast = i === workflow.length - 1;
                return (
                  <div key={stage.level} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: c.bg, border: `2px solid ${c.border}` }}>
                        {stage.status === 'Completed'
                          ? <Check className="w-4 h-4" style={{ color: c.icon }} />
                          : stage.status === 'Current'
                            ? <Clock className="w-4 h-4" style={{ color: c.icon }} />
                            : <AlertCircle className="w-4 h-4" style={{ color: c.icon }} />}
                      </div>
                      {!isLast && (
                        <div className={`step-connector ${stage.status === 'Completed' ? 'done' : 'pending'}`} />
                      )}
                    </div>

                    <div className={`pb-6 flex-1 ${isLast ? 'pb-0' : ''}`}>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                              Level {stage.level}: {stage.role}
                            </p>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}40` }}>
                              {stage.status}
                            </span>
                            {stage.verifierId === verifierContext.verifierId && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            <User className="w-3 h-3 inline mr-1" />{stage.verifierName}
                            <span className="ml-2 text-xs">· {stage.department}</span>
                          </p>
                        </div>
                        {stage.date && (
                          <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                            <Calendar className="w-3 h-3" />
                            {formatDeadline(form.deadline)}
                          </div>
                        )}
                      </div>
                      {stage.remark && (
                        <div className="mt-2 px-3 py-2 rounded-xl text-sm italic"
                          style={{
                            background: stage.actionStatus === 'Rejected' ? '#FFF5F5' : '#F0FDF4',
                            color: stage.actionStatus === 'Rejected' ? '#991B1B' : '#065F46',
                            borderLeft: `3px solid ${stage.actionStatus === 'Rejected' ? '#EF4444' : '#22C55E'}`,
                          }}>
                          "{stage.remark}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submitted Form Fields */}
          <div className="content-card p-6">
            <h3 className="font-bold text-base mb-5 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <FileText style={{ width: 18, height: 18, color: '#A855F7' }} />
              Submitted Information
            </h3>
            {fields.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No fields submitted.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((field, idx) => {
                  const isFile = field.type === 'file';
                  const fileUrl = isFile && field.value
                    ? `${field.value}`
                    : null;

                  return (
                    <div
                      key={`${field.label}-${idx}`}
                      className="rounded-xl p-4"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                        style={{ color: 'var(--text-muted)' }}>
                        {field.label}
                      </p>

                      {isFile ? (
                        fileUrl ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm hover:underline break-all transition-colors"
                            style={{ color: 'var(--primary, #A855F7)' }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                              />
                            </svg>
                            {field.value.split('/').pop()}
                          </a>
                        ) : (
                          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>—</p>
                        )
                      ) : (
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                          {field.value || '—'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Uploaded Documents */}
          <div className="content-card p-6">
            <h3 className="font-bold text-base mb-5 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Download style={{ width: 18, height: 18, color: '#14B8A6' }} />
              Uploaded Documents
            </h3>
            <div className="h-40 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--bg)', border: '1px dashed var(--border)' }}>
              <div className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Document previews load from your file storage
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right col ─────────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Student Summary */}
          <div className="content-card p-5">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-3"
                style={{ background: `hsl(${student.name.charCodeAt(0) * 7},60%,50%)` }}>
                {student.name.split(' ').map(n => n[0]).join('')}
              </div>
              <p className="font-bold" style={{ color: 'var(--text)' }}>{student.name}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
              <span className={`badge badge-${submission.status.toLowerCase()} mt-2`}>{submission.status}</span>
            </div>

            <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              {[
                { icon: Hash, label: 'Form', val: form.title },
                { icon: Calendar, label: 'Submitted', val: new Date(submission.submissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                { icon: Clock, label: 'Deadline', val: formatDeadline(form.deadline) },
                { icon: Mail, label: 'Email', val: student.email },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg)' }}>
                    <Icon className="w-4 h-4" style={{ color: '#3B82F6' }} />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{val}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verification Progress */}
          <div className="content-card p-5">
            <h4 className="font-bold text-sm mb-4" style={{ color: 'var(--text)' }}>Verification Progress</h4>
            <div className="flex items-center justify-between mb-2 text-sm">
              <span style={{ color: 'var(--text-muted)' }}>
                {acceptedLevels} of {submission.totalLevels} levels accepted
              </span>
              <span className="font-bold" style={{ color: '#3B82F6' }}>
                {progressPercent}%
              </span>
            </div>
            <div className="h-2 rounded-full mb-4" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg,#3B82F6,#14B8A6)',
                }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {workflow.map(s => (
                <div key={s.level} className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{
                    background:
                      s.status === 'Completed' ? '#F0FDF4' :
                        s.status === 'Current' ? '#EFF6FF' : 'var(--bg)',
                    color:
                      s.status === 'Completed' ? '#22C55E' :
                        s.status === 'Current' ? '#3B82F6' : 'var(--text-muted)',
                    border: `1px solid ${s.status === 'Completed' ? '#22C55E40' :
                        s.status === 'Current' ? '#3B82F640' : 'var(--border)'
                      }`,
                  }}>
                  {s.level}
                </div>
              ))}
            </div>
          </div>

          {/* Action Panel — only if verifier can act */}
          {!isFinished && canAct && (
            <div className="content-card p-5">
              <h4 className="font-bold text-sm mb-4" style={{ color: 'var(--text)' }}>Your Actions</h4>
              <div className="space-y-2.5">
                {isLastVerifier ? (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="btn-success w-full justify-center"
                    style={{ width: '100%' }}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Final Approve
                  </button>
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="btn-primary w-full justify-center"
                    style={{ width: '100%' }}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Forward to {nextVerifier?.role || 'Next Level'}
                  </button>
                )}
                <button
                  onClick={() => setSendBackModal(true)}
                  disabled={actionLoading}
                  className="btn-warning w-full justify-center"
                  style={{ width: '100%' }}
                >
                  <CornerDownLeft className="w-4 h-4" /> Send Back for Correction
                </button>
                <button
                  onClick={() => setRejectModal(true)}
                  disabled={actionLoading}
                  className="btn-danger w-full justify-center"
                  style={{ width: '100%' }}
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}