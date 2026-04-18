"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, X, Send, CheckCircle } from "lucide-react";

interface IdeaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeaModal({ open, onOpenChange }: IdeaModalProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setName("");
      setContent("");
      setSubmitted(false);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          content: content.trim(),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(handleClose, 1500);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {submitted ? (
              <motion.div
                className="flex flex-col items-center gap-3 py-8"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <CheckCircle className="h-12 w-12 text-accent" />
                <p className="text-3xl font-medium text-foreground">
                  아이디어가 전달되었어요!
                </p>
                <p className="text-2xl text-muted-foreground">
                  소중한 의견 감사합니다
                </p>
              </motion.div>
            ) : (
              <>
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    <h2 className="text-3xl font-bold text-foreground">
                      개발자에게 아이디어 보내기
                    </h2>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Form */}
                <div className="flex flex-col gap-4">
                  <div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름 + 팀명 (선택사항)"
                      maxLength={100}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-2xl text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="아이디어를 자유롭게 적어주세요"
                      maxLength={1000}
                      rows={4}
                      className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-2xl text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none"
                    />
                    <p className="mt-1 text-right text-xl text-muted-foreground/50">
                      {content.length}/1000
                    </p>
                  </div>

                  {/* Notice */}
                  <p className="rounded-lg bg-accent/10 px-3 py-2 text-xl text-accent leading-relaxed">
                    좋은 아이디어가 서비스에 반영되면 소정의 상품을 드려요!
                  </p>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!content.trim() || submitting}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-2xl font-medium text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "보내는 중..." : "보내기"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
