"use client";
import React, { useState, useEffect } from "react";
import { likes, posts } from "@wix/blog";
import { comments as commentsApi } from "@wix/comments";

const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";
const BLOG_POST_FQDN = "wix.blog.v3.post";

interface Props {
  postId: string;
}

export default function BlogEngagement({ postId }: Props) {
  const [metrics, setMetrics] = useState({ views: 0, likes: 0, comments: 0 });
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMetrics();
    loadComments();
    checkIfLiked();
  }, [postId]);

  async function loadMetrics() {
    try {
      const res = await posts.getPostMetrics(postId);
      if (res.metrics) {
        setMetrics({
          views: res.metrics.views ?? 0,
          likes: res.metrics.likes ?? 0,
          comments: res.metrics.comments ?? 0,
        });
      }
    } catch {}
  }

  async function loadComments() {
    try {
      const res = await commentsApi.listCommentsByResource({
        appId: BLOG_APP_ID,
        resourceId: postId,
        limit: 50,
        order: "OLDEST",
      });
      setCommentsList(res.comments || []);
    } catch {}
  }

  async function checkIfLiked() {
    try {
      const res = await likes.getLikeByFqdnAndEntityId(BLOG_POST_FQDN, postId);
      if (res.like) {
        setLiked(true);
      }
    } catch {
      setLiked(false);
    }
  }

  async function toggleLike() {
    setLikeLoading(true);
    try {
      if (liked) {
        await likes.deleteLikeByFqdnAndEntityId(BLOG_POST_FQDN, postId);
        setLiked(false);
        setMetrics((m) => ({ ...m, likes: Math.max(0, m.likes - 1) }));
      } else {
        await likes.createLike({
          like: {
            fqdn: BLOG_POST_FQDN,
            entityId: postId,
          },
        });
        setLiked(true);
        setMetrics((m) => ({ ...m, likes: m.likes + 1 }));
      }
    } catch (e) {
      console.error("Like error:", e);
    }
    setLikeLoading(false);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await commentsApi.createComment({
        appId: BLOG_APP_ID,
        contextId: postId,
        resourceId: postId,
        comment: {
          commentAuthor: {
            guestAuthor: {
              name: commentName.trim() || "Anonymous Space Cat",
            },
          },
          plainTextContent: { text: newComment.trim() },
        },
      });
      setNewComment("");
      setCommentName("");
      setMetrics((m) => ({ ...m, comments: m.comments + 1 }));
      await loadComments();
    } catch (e) {
      console.error("Comment error:", e);
    }
    setSubmitting(false);
  }

  function formatCommentDate(dateStr: string | undefined) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getCommentAuthorName(comment: any): string {
    const author = comment.author;
    if (!author) return "Anonymous Space Cat";
    if (author.guestAuthorName) return author.guestAuthorName;
    if (author.memberName) return author.memberName;
    return "Anonymous Space Cat";
  }

  function getCommentText(comment: any): string {
    if (comment.plainContent?.text) return comment.plainContent.text;
    const nodes = comment.richContent?.nodes || [];
    for (const node of nodes) {
      if (node.type === "PARAGRAPH") {
        for (const child of node.nodes || []) {
          if (child.type === "TEXT" && child.textData?.text) {
            return child.textData.text;
          }
        }
      }
    }
    return "";
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Engagement Stats */}
      <div style={statsBarStyle}>
        <div style={statItemStyle}>
          <span style={statNumStyle}>{metrics.views}</span>
          <span style={statLabelStyle}>Views</span>
        </div>
        <div style={statItemStyle}>
          <span style={statNumStyle}>{metrics.likes}</span>
          <span style={statLabelStyle}>Likes</span>
        </div>
        <div style={statItemStyle}>
          <span style={statNumStyle}>{metrics.comments}</span>
          <span style={statLabelStyle}>Comments</span>
        </div>

        <button
          onClick={toggleLike}
          disabled={likeLoading}
          style={{
            ...likeButtonStyle,
            background: liked ? "#ff6600" : "transparent",
            color: liked ? "#000" : "#ff6600",
          }}
        >
          {liked ? "♥ Liked" : "♡ Like this post"}
        </button>
      </div>

      {/* Comments Section */}
      <div style={commentsSectionStyle}>
        <h3 style={commentsHeadingStyle}>
          Transmissions ({metrics.comments})
        </h3>

        {commentsList.length > 0 && (
          <div style={commentsListStyle}>
            {commentsList.map((comment) => (
              <div key={comment._id} style={commentCardStyle}>
                <div style={commentHeaderStyle}>
                  <span style={commentAuthorStyle}>
                    {getCommentAuthorName(comment)}
                  </span>
                  <span style={commentDateStyle}>
                    {formatCommentDate(comment._createdDate)}
                  </span>
                </div>
                <p style={commentTextStyle}>{getCommentText(comment)}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submitComment} style={commentFormStyle}>
          <h4 style={formTitleStyle}>Leave a Transmission</h4>
          <input
            type="text"
            placeholder="Your name (optional)"
            value={commentName}
            onChange={(e) => setCommentName(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Write your message to the crew..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical" as const }}
            required
          />
          <button type="submit" disabled={submitting} style={submitButtonStyle}>
            {submitting ? "Transmitting..." : "Send Transmission"}
          </button>
        </form>
      </div>
    </div>
  );
}

const statsBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "32px",
  padding: "24px 0",
  borderTop: "1px solid #222",
  borderBottom: "1px solid #222",
  marginTop: "40px",
  flexWrap: "wrap",
};

const statItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const statNumStyle: React.CSSProperties = {
  fontFamily: "'Black Ops One', cursive",
  fontSize: "1.5rem",
  color: "#ff6600",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginTop: "2px",
};

const likeButtonStyle: React.CSSProperties = {
  marginLeft: "auto",
  padding: "10px 24px",
  border: "2px solid #ff6600",
  borderRadius: "8px",
  fontFamily: "'Bangers', cursive",
  fontSize: "1rem",
  letterSpacing: "1px",
  cursor: "pointer",
  transition: "all 0.3s",
};

const commentsSectionStyle: React.CSSProperties = {
  marginTop: "40px",
};

const commentsHeadingStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive",
  fontSize: "1.5rem",
  color: "#ff6600",
  letterSpacing: "1px",
  marginBottom: "20px",
};

const commentsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  marginBottom: "30px",
};

const commentCardStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #222",
  borderRadius: "12px",
  padding: "16px 20px",
};

const commentHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const commentAuthorStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive",
  fontSize: "0.95rem",
  color: "#ffcc00",
  letterSpacing: "1px",
};

const commentDateStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#666",
};

const commentTextStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: "0.9rem",
  lineHeight: "1.6",
  margin: 0,
};

const commentFormStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #222",
  borderRadius: "12px",
  padding: "24px",
};

const formTitleStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive",
  fontSize: "1.1rem",
  color: "#ffcc00",
  letterSpacing: "1px",
  marginBottom: "16px",
  marginTop: 0,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: "8px",
  color: "#e0e0e0",
  fontSize: "0.9rem",
  fontFamily: "'Inter', sans-serif",
  marginBottom: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const submitButtonStyle: React.CSSProperties = {
  padding: "12px 32px",
  background: "#ff6600",
  color: "#000",
  border: "none",
  borderRadius: "8px",
  fontFamily: "'Bangers', cursive",
  fontSize: "1rem",
  letterSpacing: "1px",
  cursor: "pointer",
  transition: "all 0.3s",
};
