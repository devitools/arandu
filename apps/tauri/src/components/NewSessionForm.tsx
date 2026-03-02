import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MicButton } from "@/components/MicButton";
import { useTranslation } from "react-i18next";

interface NewSessionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, prompt: string) => void;
  isLoading?: boolean;
}

export function NewSessionForm({ open, onOpenChange, onSubmit, isLoading }: NewSessionFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    onSubmit(name.trim(), prompt.trim());
    setName("");
    setPrompt("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setPrompt("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("sessions.newSession")}</DialogTitle>
            <DialogDescription>{t("sessions.formDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                {t("sessions.formName")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("sessions.formNamePlaceholder")}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring font-mono"
                autoFocus
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                {t("sessions.formPrompt")}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("sessions.formPromptPlaceholder")}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring font-mono resize-y"
                rows={8}
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <div className="mr-auto">
              <MicButton size="sm" onTranscriptionComplete={(text) => setPrompt((prev) => prev + text)} />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !prompt.trim() || isLoading}
            >
              {isLoading ? t("common.loading") : t("sessions.formSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
