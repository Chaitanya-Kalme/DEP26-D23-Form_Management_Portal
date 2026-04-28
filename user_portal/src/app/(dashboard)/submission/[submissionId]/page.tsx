"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileText, User2, Calendar, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface WorkflowStep {
  level: number;
  verifierId: string | null;
  verifierName: string;
  role: string;
  department: string;
  status: "Completed" | "Current" | "Pending";
  actionStatus: "Approved" | "Rejected" | null;
  remark: string | null;
  date: string | null;
}

interface FormField {
  label: string;
  value: string;
  type: string;
}

interface SubmissionDetail {
  submission: {
    id: string;
    status: string;
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
    isClosedForUser: boolean;
  };
  fields: FormField[];
  workflow: WorkflowStep[];
}

function getStatusColor(status: string) {
  switch (status) {
    case "Accepted":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "Pending":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "Rejected":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "Expired":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-blue-100 text-blue-700 border-blue-200";
  }
}

function getDeadlineInfo(dateStr?: string | null) {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  date.setHours(23, 59, 59, 999); // 🔥 fix: full-day validity

  const now = new Date();

  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    date,
    label: date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    isExpired: date < now,
    isExpiringSoon: diffDays <= 3 && diffDays >= 0,
    diffDays,
  };
}

function getStatusIcon(status: string) {
  switch (status) {
    case "Accepted":
      return <CheckCircle2 className="h-5 w-5" />;
    case "Pending":
      return <Clock className="h-5 w-5" />;
    case "Rejected":
      return <XCircle className="h-5 w-5" />;
    case "Expired":
      return <AlertCircle className="h-5 w-5" />;
    default:
      return null;
  }
}

function getWorkflowStepColor(workflowStatus: string, actionStatus: string | null) {
  if (workflowStatus === "Completed") {
    if (actionStatus === "Rejected") return "bg-rose-100 border-rose-300 text-rose-700";
    return "bg-emerald-100 border-emerald-300 text-emerald-700";
  }
  if (workflowStatus === "Current") return "bg-indigo-100 border-indigo-300 text-indigo-700";
  return "bg-slate-100 border-slate-300 text-slate-600";
}

export default function SubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.submissionId) return;

    const fetchSubmission = async () => {
      try {
        const res = await fetch(`/api/submissions/${params.submissionId}`);
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const response = await res.json();
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load submission");
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [params.submissionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto" />
          <p className="text-muted-foreground">Loading submission details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="pt-6">
            <p className="text-rose-700 font-semibold">{error || "Submission not found"}</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const deadlineDate = data.form.deadline ? new Date(data.form.deadline) : null;
  const now = new Date();
  const diffDays = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const isExpired = diffDays !== null && diffDays < 0;
  const isExpiringSoon = diffDays !== null && diffDays <= 3 && diffDays >= 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              <h1 className="font-heading text-3xl font-bold text-slate-900">
                {data.form.title}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Submission ID: {data.submission.id}
            </p>
          </div>
        </div>
        <Badge className={`${getStatusColor(data.submission.status)} border text-base px-4 py-2 font-semibold flex items-center gap-2`}>
          {getStatusIcon(data.submission.status)}
          {data.submission.status}
        </Badge>
      </div>

      {/* Verification Workflow */}
      <Card className="shadow-card border-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-violet-50 border-b">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-indigo-600" />
            Verification Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {data.workflow.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No workflow steps available
              </p>
            ) : (
              data.workflow.map((step, index) => (
                <motion.div
                  key={step.level}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-4"
                >
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-10 w-10 rounded-full border-2 flex items-center justify-center font-semibold ${getWorkflowStepColor(step.status, step.actionStatus)}`}
                    >
                      {step.level}
                    </div>
                    {index !== data.workflow.length - 1 && (
                      <div
                        className={`w-1 h-12 mt-1 ${step.status === "Completed" ? "bg-emerald-300" : "bg-slate-200"
                          }`}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {step.verifierName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {step.role}
                            {step.department && ` • ${step.department}`}
                          </p>
                        </div>
                        <Badge
                          className={`text-xs font-semibold ${step.status === "Completed"
                            ? step.actionStatus === "Rejected"
                              ? "bg-rose-100 text-rose-700 border-rose-200"
                              : "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : step.status === "Current"
                              ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                            } border`}
                        >
                          {step.status === "Current" && "In Review"}
                          {step.status === "Pending" && "Pending"}
                          {step.status === "Completed" && (step.actionStatus || "Completed")}
                        </Badge>
                      </div>

                      {step.date && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {formatDate(step.date)}
                        </p>
                      )}

                      {step.remark && (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded p-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Remark:
                          </p>
                          <p className="text-sm text-slate-700">{step.remark}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Info Card */}
      <Card className="shadow-card border-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <User2 className="h-4 w-4 text-blue-600" />
            Submitted By
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Name
              </p>
              <p className="text-sm font-medium text-slate-900">{data.student.name}</p>


              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Email
              </p>
              <p className="text-sm text-slate-700">{data.student.email}</p>

            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Submission Date
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {formatDate(data.submission.submissionDate)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Deadline
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-600" />

                  <p
                    className={`text-sm font-medium ${isExpired
                      ? "text-rose-600"
                      : isExpiringSoon
                        ? "text-amber-600"
                        : "text-slate-900"
                      }`}
                  >
                    {deadlineDate
                      ? formatDate(data.form.deadline)
                      : "No deadline set"}
                  </p>

                  {isExpired && (
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">
                      Closed
                    </Badge>
                  )}

                  {!isExpired && isExpiringSoon && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      Closing Soon
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student Info Card */}
      <Card className="shadow-card border-0 overflow-hidden">

        <CardContent className="pt-6">
          <div className="space-y-3">

          </div>
        </CardContent>
      </Card>

      {/* Form Data - READ-ONLY PREVIEW */}
      <Card className="shadow-card border-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600" />
            Form Data (Preview)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {data.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No form data available
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.fields.map((field, index) => {
                const isFile = field.type === "file";

                const cleanPath = field.value
                  ? field.value.replace(/^\/+/, "")
                  : null;

                const fileUrl = isFile && cleanPath
                  ? `/${cleanPath}`   // uses proxy (no backend URL)
                  : null;

                const fileName = cleanPath
                  ? cleanPath.split("/").pop()
                  : null;

                return (
                  <motion.div
                    key={`${field.label}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="space-y-2 p-4 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {field.label}
                    </p>

                    {isFile ? (
                      fileUrl ? (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline break-all transition-colors"
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
                          {fileName}
                        </a>
                      ) : (
                        <p className="text-sm text-slate-400">—</p>
                      )
                    ) : (
                      <p className="text-sm font-medium text-slate-900 break-words">
                        {field.value || "—"}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>


    </motion.div>
  );
}
