import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Copy, Check } from "lucide-react";

const { invoke } = window.__TAURI__.core;

interface DiagnosticsResult {
  platform: string;
  arch: string;
  copilot_binary_used: string;
  copilot_binary_found: boolean;
  copilot_version: string | null;
  copilot_version_error: string | null;
  gh_token_set: boolean;
  path_env: string;
  home_env: string;
  acp_ok: boolean;
  acp_elapsed_ms: number | null;
  acp_error: string | null;
  acp_command: string | null;
  acp_stderr: string | null;
}

function StatusIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
  if (warn) return <AlertCircle className="h-4 w-4 text-warning shrink-0" />;
  return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
}

function Row({ label, ok, value, warn }: { label: string; ok: boolean; value: string; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <StatusIcon ok={ok} warn={warn} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <p className="text-sm font-mono break-all mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function DiagnosticsSettings() {
  const { t } = useTranslation();
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copilotPath = localStorage.getItem("arandu-copilot-path") ?? null;
  const ghToken = localStorage.getItem("arandu-gh-token") ?? null;

  async function runDiagnostics() {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<DiagnosticsResult>("run_diagnostics", {
        binaryPath: copilotPath,
        ghToken: ghToken,
      });
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyReport() {
    if (!result) return;
    const lines = [
      `platform: ${result.platform} / ${result.arch}`,
      `home: ${result.home_env}`,
      `copilot binary: ${result.copilot_binary_used}`,
      `binary found: ${result.copilot_binary_found}`,
      `version: ${result.copilot_version ?? result.copilot_version_error ?? "n/a"}`,
      `gh_token set: ${result.gh_token_set}`,
      `acp connection: ${result.acp_ok ? `ok (${result.acp_elapsed_ms}ms)` : result.acp_error ?? "failed"}`,
      result.acp_command ? `acp command: ${result.acp_command}` : null,
      result.acp_stderr ? `acp stderr: ${result.acp_stderr}` : null,
      `PATH: ${result.path_env}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed silently
    }
  }

  const versionOk = !!result?.copilot_version;
  const versionWarn = result?.copilot_binary_found && !result.copilot_version;

  const acpValue = result
    ? result.acp_ok
      ? `ok — ${result.acp_elapsed_ms}ms`
      : result.acp_error ?? t("diagnostics.failed")
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={runDiagnostics} disabled={loading} size="sm" variant="outline" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("diagnostics.running") : t("diagnostics.run")}
        </Button>
        {result && (
          <Button onClick={copyReport} size="sm" variant="ghost" className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("diagnostics.copied") : t("diagnostics.copy")}
          </Button>
        )}
      </div>

      {!result && !loading && !error && (
        <p className="text-sm text-muted-foreground">{t("diagnostics.hint")}</p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="rounded-md border border-border bg-muted/30 px-3 divide-y divide-border">
          <Row
            label={t("diagnostics.platform")}
            ok
            value={`${result.platform} / ${result.arch}`}
          />
          <Row
            label={t("diagnostics.binary")}
            ok={result.copilot_binary_found}
            value={result.copilot_binary_used}
          />
          <Row
            label={t("diagnostics.version")}
            ok={versionOk}
            warn={versionWarn}
            value={
              result.copilot_version ??
              result.copilot_version_error ??
              t("diagnostics.notAvailable")
            }
          />
          <Row
            label={t("diagnostics.ghToken")}
            ok={result.gh_token_set}
            warn={!result.gh_token_set}
            value={result.gh_token_set ? t("diagnostics.tokenSet") : t("diagnostics.tokenNotSet")}
          />
          <Row
            label={t("diagnostics.acpConnection")}
            ok={result.acp_ok}
            value={acpValue}
          />
          {result.acp_command && (
            <Row
              label={t("diagnostics.acpCommand")}
              ok
              value={result.acp_command}
            />
          )}
          {result.acp_stderr && (
            <Row
              label={t("diagnostics.acpStderr")}
              ok={false}
              value={result.acp_stderr}
            />
          )}
          <Row
            label={t("diagnostics.home")}
            ok={!!result.home_env}
            value={result.home_env || t("diagnostics.notSet")}
          />
          <Row
            label={t("diagnostics.path")}
            ok={!!result.path_env}
            value={result.path_env || t("diagnostics.notSet")}
          />
        </div>
      )}
    </div>
  );
}

