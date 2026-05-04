import { useId, useMemo, useState } from "react";
import { usePlanner } from "../state";
import { Icon } from "../ui/icons";

const DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
].join(",");

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)}KB`;
  return `${size}B`;
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function DocumentImportPanel() {
  const { state, actions } = usePlanner();
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [instruction, setInstruction] = useState("");
  const [localError, setLocalError] = useState("");
  const busy = state.llmChat.importing || state.llmChat.sending;
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function addFiles(nextFiles: FileList | null) {
    const incoming = Array.from(nextFiles || []);
    if (!incoming.length) return;
    setLocalError("");
    setFiles((current) => {
      const byKey = new Map(current.map((file) => [fileKey(file), file]));
      incoming.forEach((file) => byKey.set(fileKey(file), file));
      return Array.from(byKey.values()).slice(0, 10);
    });
  }

  async function submitImport() {
    if (!files.length) {
      setLocalError("가져올 문서를 선택하세요.");
      return;
    }
    setLocalError("");
    const succeeded = await actions.importDocuments(files, instruction);
    if (succeeded) {
      setFiles([]);
      setInstruction("");
    }
  }

  return (
    <section className="document-import-panel" aria-label="문서 가져오기">
      <div className="document-import-toolbar">
        <label className="text-button" htmlFor={inputId}>
          <Icon name="paperclip" />
          문서 선택
        </label>
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          onChange={(event) => {
            addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          className="document-import-instruction"
          type="text"
          value={instruction}
          placeholder="이식 지시"
          onChange={(event) => setInstruction(event.currentTarget.value)}
          disabled={busy}
        />
        <button className="text-button primary" type="button" onClick={() => void submitImport()} disabled={busy || !files.length}>
          {state.llmChat.importing ? <Icon name="loader-circle" /> : <Icon name="upload" />}
          가져오기
        </button>
      </div>
      {files.length ? (
        <div className="document-import-files">
          <span className="document-import-total">
            {files.length}개 · {formatFileSize(totalSize)}
          </span>
          {files.map((file) => (
            <span className="document-file-chip" key={fileKey(file)}>
              <Icon name="file-text" />
              <span>{file.name}</span>
              <em>{formatFileSize(file.size)}</em>
              <button
                className="small-icon-button"
                type="button"
                onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))}
                disabled={busy}
                aria-label={`${file.name} 제거`}
              >
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {(localError || state.llmChat.importFileErrors.length > 0) && (
        <div className="document-import-errors" role="alert">
          {localError ? <p>{localError}</p> : null}
          {state.llmChat.importFileErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </section>
  );
}
