"use client";

import React, { useCallback, useMemo, useState } from "react";

type Props = {
  maxBytes?: number; // default 25MB
  onFileSelected: (file: File) => void;
};

function fmtBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UploadDropzone({ maxBytes = 25 * 1024 * 1024, onFileSelected }: Props) {
  const [isOver, setIsOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // browser accepts mimetypes + extensions; extensions are most reliable here
  const acceptAttr = useMemo(() => [".csv", ".xlsx"].join(","), []);

  const validate = useCallback(
    (file: File) => {
      if (file.size > maxBytes) return `File too large (${fmtBytes(file.size)}). Max is ${fmtBytes(maxBytes)}.`;

      const name = file.name.toLowerCase();
      const okExt = name.endsWith(".csv") || name.endsWith(".xlsx");
      if (!okExt) return "Unsupported file type. Please choose a .csv or .xlsx.";

      return null;
    },
    [maxBytes]
  );

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      setError(null);
      if (!file) return;

      const msg = validate(file);
      if (msg) {
        setError(msg);
        return;
      }

      onFileSelected(file);
    },
    [onFileSelected, validate]
  );

  return (
    <div>
      <label
        htmlFor="file"
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
          const file = e.dataTransfer.files?.[0];
          handleFile(file);
        }}
        style={{
          display: "block",
          border: "1px dashed #444",
          borderRadius: 16,
          padding: 18,
          cursor: "pointer",
          background: isOver ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
          transition: "background 120ms ease",
          userSelect: "none",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 14 }}>Drag & drop a file here</div>
        <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
          or click to choose a <b>.csv</b> / <b>.xlsx</b> (max {fmtBytes(maxBytes)})
        </div>

        <input
          id="file"
          type="file"
          accept={acceptAttr}
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {error ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #7a2b2b", borderRadius: 12 }}>
          <div style={{ fontWeight: 900 }}>Upload issue</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>{error}</div>
        </div>
      ) : null}
    </div>
  );
}
