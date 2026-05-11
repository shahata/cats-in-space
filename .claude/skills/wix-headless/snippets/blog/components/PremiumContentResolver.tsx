"use client";
import { useEffect, useState } from "react";
import { posts } from "@wix/blog";
import type { posts as blogTypes } from "@wix/blog";
import RichContentViewer from "./RichContentViewer";
import { i18n } from "@wix/essentials";

interface Props {
  slug: string;
  previewContent?: blogTypes.RichContent;
}

export default function PremiumContentResolver({
  slug,
  previewContent,
}: Props) {
  const t = i18n.getTranslationFunction();
  const [content, setContent] = useState<blogTypes.RichContent | undefined>(
    previewContent,
  );
  const [isPreview, setIsPreview] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await posts.getPostBySlug(slug, {
          fieldsets: ["RICH_CONTENT"],
        });
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
        {content && <RichContentViewer content={content} />}
      </div>
      {isPreview && !loading && (
        <div className="paywall">
          <div className="paywall-fade"></div>
          <div className="paywall-content">
            <h3>{t("premium.membersOnly")}</h3>
            <p>{t("premium.subscribeToRead")}</p>
            <a href="/plans" className="paywall-btn">
              {t("premium.viewPlans")}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
