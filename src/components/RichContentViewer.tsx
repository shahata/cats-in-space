"use client";
import React from "react";
import { quickStartViewerPlugins, RicosViewer } from "@wix/ricos";
import "@wix/ricos/css/all-plugins-viewer.css";

const plugins = quickStartViewerPlugins();

type RicosContent = React.ComponentProps<typeof RicosViewer>["content"];

/**
 * Accepts RichContent from any Wix SDK module. Different SDK packages
 * (@wix/blog, @wix/members, @wix/ricos/schema) define structurally identical
 * RichContent types with minor optionality differences (nodes? vs nodes).
 * This component bridges that gap.
 */
const RichContentViewer = ({ content }: { content?: RicosContent | { nodes?: unknown[]; metadata?: unknown } }) => {
  return <RicosViewer content={content as RicosContent} plugins={plugins} />;
};

export default RichContentViewer;
