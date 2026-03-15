"use client";
import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { RicosEditor, pluginDivider, pluginEmoji, pluginLink, pluginImage } from "@wix/ricos";
import type { RicosEditorType } from "@wix/ricos";

const plugins = [pluginDivider(), pluginEmoji(), pluginLink(), pluginImage()];

export interface RichContentEditorHandle {
  getContent: () => Promise<any>;
}

interface Props {
  content?: any;
  placeholder?: string;
}

const RichContentEditor = forwardRef<RichContentEditorHandle, Props>(({ content, placeholder }, ref) => {
  const editorRef = useRef<RicosEditorType>(null);

  useImperativeHandle(ref, () => ({
    getContent: async () => {
      if (editorRef.current) {
        return editorRef.current.getContent();
      }
      return content;
    },
  }));

  return (
    <div style={editorWrapperStyle}>
      <RicosEditor
        ref={editorRef}
        content={content}
        plugins={plugins}
        placeholder={placeholder}
      />
    </div>
  );
});

RichContentEditor.displayName = "RichContentEditor";
export default RichContentEditor;

const editorWrapperStyle: React.CSSProperties = {
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "12px",
  minHeight: "120px",
  color: "#e0e0e0",
};
