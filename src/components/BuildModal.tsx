import { CheckCircle2, XCircle, Download, AlertTriangle } from 'lucide-react';
import { Modal, Button, Progress, formatBytes } from './ui';
import type { ApkBuildResult } from '../engine/apk';
import { getErrorDef } from '../engine/errors';

export interface BuildModalProps {
  open: boolean;
  onClose: () => void;
  running: boolean;
  step: number;
  steps: string[];
  result?: ApkBuildResult | null;
  error?: { id: string; title: string; detail: string } | null;
  apkName?: string;
  outputPath?: string;
  onDownload?: () => void;
  extra?: React.ReactNode;
}

export function BuildModal({
  open,
  onClose,
  running,
  step,
  steps,
  result,
  error,
  apkName,
  outputPath,
  onDownload,
  extra,
}: BuildModalProps) {
  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title={error ? 'Build failed' : result ? 'APK is ready' : 'Building app'}
      sub={error ? error.id : result ? outputPath : undefined}
      width={520}
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" icon={<Download size={15} />} onClick={onDownload}>
              Download APK
            </Button>
          </>
        ) : error ? (
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        ) : null
      }
    >
      {error ? (
        <div className="col gap-12">
          <div className="flex gap-12" style={{ color: 'var(--danger)' }}>
            <XCircle size={20} style={{ flex: 'none' }} />
            <div>
              <div style={{ fontWeight: 600 }}>{error.title}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {error.detail}
              </div>
            </div>
          </div>
          <div className="hint">{getErrorDef(error.id).fix}</div>
        </div>
      ) : (
        <>
          <div className="steps">
            {steps.map((s, i) => {
              const state = result ? 'done' : i < step ? 'done' : i === step ? 'active' : 'idle';
              return (
                <div className={`step ${state}`} key={s}>
                  <div className="n">
                    {state === 'done' ? (
                      <CheckCircle2 size={12} />
                    ) : state === 'active' ? (
                      <div className="spinner" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  {s}
                  {state === 'done' && <span className="ms">ok</span>}
                </div>
              );
            })}
          </div>
          <Progress value={result ? 100 : ((step + 1) / steps.length) * 100} />
          {result && (
            <>
              <div className="grid g-3 mt-16">
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Size</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    {formatBytes(result.size)}
                  </div>
                </div>
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Files</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    {result.files.length}
                  </div>
                </div>
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Signature</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    v2
                  </div>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div className="col gap-6 mt-12">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex gap-8" style={{ fontSize: 12, color: 'var(--warn)' }}>
                      <AlertTriangle size={13} style={{ flex: 'none' }} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-16" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                <div className="mono tiny" style={{ color: 'var(--text-4)', marginBottom: 6 }}>
                  APK CONTENTS
                </div>
                <div className="col gap-4">
                  {result.files.slice(0, 8).map((f) => (
                    <div key={f.name} className="flex between mono" style={{ fontSize: 10.5 }}>
                      <span style={{ color: 'var(--text-2)' }}>{f.name}</span>
                      <span style={{ color: 'var(--text-4)' }}>{formatBytes(f.size)}</span>
                    </div>
                  ))}
                  {result.files.length > 8 && (
                    <div className="mono tiny" style={{ color: 'var(--text-4)' }}>
                      + {result.files.length - 8} more files
                    </div>
                  )}
                </div>
              </div>
              {extra}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
