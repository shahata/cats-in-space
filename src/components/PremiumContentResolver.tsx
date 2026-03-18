"use client";
import { useEffect, useState } from "react";
import { posts } from "@wix/blog";
import type { posts as blogTypes } from "@wix/blog";
import RichContentViewer from "./RichContentViewer";

interface Props {
  slug: string;
  previewContent?: blogTypes.RichContent;
}

export default function PremiumContentResolver({ slug, previewContent }: Props) {
  const [content, setContent] = useState<blogTypes.RichContent | undefined>(previewContent);
  const [isPreview, setIsPreview] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await posts.getPostBySlug(slug, { fieldsets: ["RICH_CONTENT"] });
        if (result.post && !result.post.preview) {
          setContent(result.post.richContent);
          setIsPreview(false);
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug]);

  return (
    <>
      <div className={isPreview ? "post-preview" : undefined}>
        <RichContentViewer content={content} />
      </div>
      {isPreview && !loading && (
        <div className="paywall">
          <div className="paywall-fade"></div>
          <div className="paywall-content">
            <h3>This content is for crew members only</h3>
            <p>Subscribe to a plan to read the full transmission</p>
            <a href="/plans" className="paywall-btn">View Plans</a>
          </div>
        </div>
      )}
    </>
  );
}
