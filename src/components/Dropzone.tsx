import { useEffect, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  compact,
  title,
  sub,
  children,
  folder,
  ...rest
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  compact?: boolean;
  title?: string;
  sub?: string;
  children?: React.ReactNode;
  folder?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  return (
    <div
      className={`dropzone ${drag ? 'drag' : ''} ${compact ? 'compact' : ''}`}
      {...rest}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDrag(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDrag(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDrag(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        {...(folder ? { webkitdirectory: '', directory: '' } : {})}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      {children ?? (
        <>
          <div className="ico">
            <UploadCloud />
          </div>
          <div className="t">{title ?? 'Перетащите файлы сюда'}</div>
          <div className="s">{sub ?? 'или нажмите, чтобы выбрать'}</div>
        </>
      )}
    </div>
  );
}

export function useFileDrop(onFiles: (files: File[]) => void) {
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const enter = (e: DragEvent) => {
      e.preventDefault();
      depth.current++;
      setDrag(true);
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDrag(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDrag(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFiles]);
  return drag;
}
