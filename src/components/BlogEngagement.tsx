"use client";
import React, { useState, useEffect, useCallback } from "react";
import { likes, posts } from "@wix/blog";
import { comments as commentsApi } from "@wix/comments";
import { httpClient } from "@wix/essentials";

const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";
const BLOG_POST_FQDN = "wix.blog.v3.post";

interface Props {
  postId: string;
  referenceId: string;
}

export default function BlogEngagement({ postId, referenceId }: Props) {
  const [metrics, setMetrics] = useState({ views: 0, likes: 0, comments: 0 });
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [topLevelComments, setTopLevelComments] = useState<any[]>([]);
  const [repliesMap, setRepliesMap] = useState<Record<string, any[]>>({});
  const [totalComments, setTotalComments] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyName, setReplyName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [myVisitorId, setMyVisitorId] = useState<string | null>(null);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    reportView();
    loadMetrics();
    checkIfLiked();
    loadComments();
  }, [postId]);

  async function reportView() {
    try {
      await httpClient.fetchWithAuth(
        `https://www.wixapis.com/blog/v3/posts/${postId}/view`,
        { method: "POST" }
      );
    } catch {}
  }

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

  const loadComments = useCallback(async (expectedMin?: number) => {
    try {
      const res = await commentsApi.listCommentsByResource(BLOG_APP_ID, {
        contextId: referenceId,
        resourceId: referenceId,
        commentSort: { order: "OLDEST_FIRST" },
        replySort: { order: "OLDEST_FIRST" },
        cursorPaging: { limit: 100, repliesLimit: 50 },
      });
      const allComments = res.comments || [];

      // Collect all replies from commentReplies map
      const allReplies: any[] = [];
      if (res.commentReplies) {
        for (const replyData of Object.values(res.commentReplies)) {
          allReplies.push(...((replyData as any).replies || []));
        }
      }

      // Also collect replies mixed into the flat comments list
      const topLevel: any[] = [];
      for (const c of allComments) {
        const parentId = c.parentComment?._id || (c.parentComment as any)?.id;
        if (parentId) {
          allReplies.push(c);
        } else {
          topLevel.push(c);
        }
      }

      // Deduplicate replies by ID
      const seen = new Set<string>();
      const uniqueReplies: any[] = [];
      for (const r of allReplies) {
        const rid = r._id || (r as any).id;
        if (rid && !seen.has(rid)) {
          seen.add(rid);
          uniqueReplies.push(r);
        }
      }

      // Group replies by their ACTUAL parent (not the top-level comment)
      const rm: Record<string, any[]> = {};
      for (const r of uniqueReplies) {
        const parentId = r.parentComment?._id || (r.parentComment as any)?.id;
        if (parentId) {
          if (!rm[parentId]) rm[parentId] = [];
          rm[parentId].push(r);
        }
      }

      const replyCount = Object.values(rm).reduce((sum, r) => sum + r.length, 0);
      const total = topLevel.length + replyCount;
      setTopLevelComments(topLevel);
      setRepliesMap(rm);
      setTotalComments(total);

      // Retry if we expected more comments (eventual consistency)
      if (expectedMin && total < expectedMin) {
        setTimeout(() => loadComments(expectedMin), 2000);
      }
    } catch {}
  }, [referenceId]);

  async function checkIfLiked() {
    try {
      const res = await likes.getLikeByFqdnAndEntityId({ fqdn: BLOG_POST_FQDN, entityId: postId });
      if (res.like) setLiked(true);
    } catch { setLiked(false); }
  }

  async function toggleLike() {
    setLikeLoading(true);
    try {
      if (liked) {
        await likes.deleteLikeByFqdnAndEntityId({ fqdn: BLOG_POST_FQDN, entityId: postId });
        setLiked(false);
        setMetrics((m) => ({ ...m, likes: Math.max(0, m.likes - 1) }));
      } else {
        await likes.createLike({ like: { fqdn: BLOG_POST_FQDN, entityId: postId } });
        setLiked(true);
        setMetrics((m) => ({ ...m, likes: m.likes + 1 }));
      }
    } catch (e) { console.error("Like error:", e); }
    setLikeLoading(false);
  }

  function makeRichContent(text: string) {
    return { richContent: { nodes: [{ type: "PARAGRAPH", nodes: [{ type: "TEXT", textData: { text, decorations: [] } }], paragraphData: {} }] } };
  }

  function captureIdentity(comment: any) {
    const vid = comment?.author?.visitorId || comment?.author?.memberId;
    if (vid) setMyVisitorId(vid);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const commentBody: any = {
        appId: BLOG_APP_ID, contextId: referenceId, resourceId: referenceId,
        author: { authorName: commentName.trim() || "Anonymous Space Cat" },
        content: makeRichContent(newComment.trim()),
      };

      const res = await httpClient.fetchWithAuth(
        "https://www.wixapis.com/comments/v1/comments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: commentBody }),
        }
      );
      const data = await res.json();
      captureIdentity(data.comment);
      setNewComment("");
      await loadComments(totalComments + 1);
    } catch (e) { console.error("Comment error:", e); }
    setSubmitting(false);
  }

  async function submitReply(parentId: string) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.createComment({
        appId: BLOG_APP_ID, contextId: referenceId, resourceId: referenceId,
        author: { authorName: replyName.trim() || "Anonymous Space Cat" },
        parentComment: { _id: parentId },
        content: makeRichContent(replyText.trim()),
      } as any);
      captureIdentity(created);
      setReplyText("");
      setReplyName("");
      setReplyingTo(null);
      await loadComments(totalComments + 1);
    } catch (e) { console.error("Reply error:", e); }
    setSubmitting(false);
  }

  async function handleEdit(commentId: string, revision: string) {
    if (!editText.trim()) return;
    try {
      await commentsApi.updateComment(commentId, {
        revision, content: makeRichContent(editText.trim()),
      } as any);
      setEditingId(null);
      setEditText("");
      await loadComments();
    } catch (e) { console.error("Edit error:", e); }
  }

  async function toggleCommentLike(comment: any) {
    const cid = comment._id || (comment as any).id;
    if (!cid) { console.error("No comment ID for like"); return; }
    const isLiked = likedCommentIds.has(cid);
    try {
      if (isLiked) {
        await likes.deleteLikeByFqdnAndEntityId({ fqdn: BLOG_POST_FQDN, entityId: cid });
        setLikedCommentIds((prev) => { const next = new Set(prev); next.delete(cid); return next; });
      } else {
        await likes.createLike({ like: { fqdn: BLOG_POST_FQDN, entityId: cid } });
        setLikedCommentIds((prev) => new Set(prev).add(cid));
      }
    } catch (e) { console.error("Comment like error:", e); }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Delete this transmission?")) return;
    try {
      await commentsApi.deleteComment(commentId);
      await loadComments();
      await loadMetrics();
    } catch (e) { console.error("Delete error:", e); }
  }

  function isOwnComment(comment: any): boolean {
    if (!myVisitorId) return false;
    return (comment.author?.visitorId || comment.author?.memberId || comment.author?.userId) === myVisitorId;
  }

  function getCommentText(comment: any): string {
    const nodes = comment.content?.richContent?.nodes || [];
    const texts: string[] = [];
    for (const node of nodes) {
      if (node.type === "PARAGRAPH") {
        for (const child of node.nodes || []) {
          if (child.type === "TEXT" && child.textData?.text) texts.push(child.textData.text);
        }
      }
    }
    return texts.join(" ");
  }

  function formatDate(dateStr: string | Date | undefined) {
    if (!dateStr) return "";
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderReplyThread(reply: any, depth: number): React.ReactNode {
    const rAuthor = reply.author?.authorName || "Space Visitor";
    const rText = getCommentText(reply);
    const rIsMine = isOwnComment(reply);
    const rIsEditing = editingId === reply._id;
    const nestedReplies = repliesMap[reply._id] || [];
    const indent = Math.min(depth * 24, 72);
    const replyingToName = reply.parentComment?.author?.authorName
      || (reply.parentComment as any)?.authorName
      || "someone";

    return (
      <div key={reply._id + "-" + myVisitorId} style={{ ...commentCardStyle, marginLeft: indent, borderLeft: "2px solid #333" }}>
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={commentAuthorStyle}>{rAuthor}</span>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>replying to {replyingToName}</span>
          </div>
          <span style={commentDateStyle}>{formatDate(reply._createdDate)}</span>
        </div>
        {rIsEditing ? (
          <div style={{ marginTop: "8px" }}>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
              rows={2} style={{ ...inputStyle, marginBottom: "8px", resize: "vertical" as const }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => handleEdit(reply._id, reply.revision)}
                style={{ ...smallBtnStyle, background: "#ff6600", color: "#000" }}>Save</button>
              <button onClick={() => { setEditingId(null); setEditText(""); }}
                style={smallBtnStyle}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={commentTextStyle}>{rText}</p>
        )}
        {!rIsEditing && (
          <div style={commentActionsStyle}>
            <button onClick={() => toggleCommentLike(reply)}
              style={{ ...actionBtnStyle, color: likedCommentIds.has(reply._id || (reply as any).id) ? "#ff6600" : "#888" }}>
              {likedCommentIds.has(reply._id || (reply as any).id) ? "♥ Liked" : "♡ Like"}</button>
            <button onClick={() => { setReplyingTo(replyingTo === reply._id ? null : reply._id); setReplyText(""); setReplyName(""); }}
              style={actionBtnStyle}>Reply</button>
            {rIsMine && (
              <>
                <button onClick={() => { setEditingId(reply._id); setEditText(rText); }}
                  style={actionBtnStyle}>Edit</button>
                <button onClick={() => handleDelete(reply._id)}
                  style={{ ...actionBtnStyle, color: "#cc0000" }}>Delete</button>
              </>
            )}
          </div>
        )}
        {replyingTo === reply._id && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #222" }}>
            <input type="text" placeholder="Your name (optional)" value={replyName}
              onChange={(e) => setReplyName(e.target.value)} style={{ ...inputStyle, marginBottom: "8px" }} />
            <textarea placeholder="Write a reply..." value={replyText}
              onChange={(e) => setReplyText(e.target.value)} rows={2}
              style={{ ...inputStyle, marginBottom: "8px", resize: "vertical" as const }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => submitReply(reply._id)} disabled={submitting}
                style={{ ...smallBtnStyle, background: "#ff6600", color: "#000" }}>
                {submitting ? "Sending..." : "Send Reply"}</button>
              <button onClick={() => setReplyingTo(null)} style={smallBtnStyle}>Cancel</button>
            </div>
          </div>
        )}
        {nestedReplies.length > 0 && (
          <div style={{ marginTop: "8px" }}>
            {nestedReplies.map((nr: any) => renderReplyThread(nr, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const commentElements = topLevelComments.map((comment) => {
    const author = comment.author?.authorName || "Space Visitor";
    const text = getCommentText(comment);

    const replies = repliesMap[comment._id] || [];
    const isEditing = editingId === comment._id;
    const isMine = isOwnComment(comment);

    return (
      <div key={comment._id + "-" + myVisitorId} style={commentCardStyle}>
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={commentAuthorStyle}>{author}</span>
          </div>
          <span style={commentDateStyle}>{formatDate(comment._createdDate)}</span>
        </div>

        {isEditing ? (
          <div style={{ marginTop: "8px" }}>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
              rows={3} style={{ ...inputStyle, marginBottom: "8px", resize: "vertical" as const }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => handleEdit(comment._id, comment.revision)}
                style={{ ...smallBtnStyle, background: "#ff6600", color: "#000" }}>Save</button>
              <button onClick={() => { setEditingId(null); setEditText(""); }}
                style={smallBtnStyle}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={commentTextStyle}>{text}</p>
        )}

        {!isEditing && (
          <div style={commentActionsStyle}>
            <button onClick={() => toggleCommentLike(comment)}
              style={{ ...actionBtnStyle, color: likedCommentIds.has(comment._id) ? "#ff6600" : "#888" }}>
              {likedCommentIds.has(comment._id) ? "♥ Liked" : "♡ Like"}</button>
            <button onClick={() => { setReplyingTo(replyingTo === comment._id ? null : comment._id); setReplyText(""); setReplyName(""); }}
              style={actionBtnStyle}>Reply{replies.length > 0 ? ` (${replies.length})` : ""}</button>
            {isMine && (
              <>
                <button onClick={() => { setEditingId(comment._id); setEditText(text); }}
                  style={actionBtnStyle}>Edit</button>
                <button onClick={() => handleDelete(comment._id)}
                  style={{ ...actionBtnStyle, color: "#cc0000" }}>Delete</button>
              </>
            )}
          </div>
        )}

        {replyingTo === comment._id && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #222" }}>
            <input type="text" placeholder="Your name (optional)" value={replyName}
              onChange={(e) => setReplyName(e.target.value)}
              style={{ ...inputStyle, marginBottom: "8px" }} />
            <textarea placeholder="Write a reply..." value={replyText}
              onChange={(e) => setReplyText(e.target.value)} rows={2}
              style={{ ...inputStyle, marginBottom: "8px", resize: "vertical" as const }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => submitReply(comment._id)} disabled={submitting}
                style={{ ...smallBtnStyle, background: "#ff6600", color: "#000" }}>
                {submitting ? "Sending..." : "Send Reply"}</button>
              <button onClick={() => setReplyingTo(null)} style={smallBtnStyle}>Cancel</button>
            </div>
          </div>
        )}

        {replies.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {replies.map((reply: any) => renderReplyThread(reply, 1))}
          </div>
        )}
      </div>
    );
  });

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
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
          <span style={statNumStyle}>{totalComments}</span>
          <span style={statLabelStyle}>Comments</span>
        </div>
        <button onClick={toggleLike} disabled={likeLoading}
          style={{ ...likeButtonStyle, background: liked ? "#ff6600" : "transparent", color: liked ? "#000" : "#ff6600" }}>
          {liked ? "♥ Liked" : "♡ Like this post"}
        </button>
      </div>

      <div style={commentsSectionStyle}>
        <h3 style={commentsHeadingStyle}>Transmissions ({totalComments})</h3>
        {commentElements.length > 0 && <div style={commentsListStyle}>{commentElements}</div>}

        <form onSubmit={submitComment} style={commentFormStyle}>
          <h4 style={formTitleStyle}>Leave a Transmission</h4>
          <input type="text" placeholder="Your name (optional)" value={commentName}
            onChange={(e) => setCommentName(e.target.value)} style={inputStyle} />
          <textarea placeholder="Write your message to the crew..." value={newComment}
            onChange={(e) => setNewComment(e.target.value)} rows={4}
            style={{ ...inputStyle, resize: "vertical" as const }} required />
          <button type="submit" disabled={submitting} style={submitButtonStyle}>
            {submitting ? "Transmitting..." : "Send Transmission"}
          </button>
        </form>
      </div>
    </div>
  );
}

const statsBarStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "32px", padding: "24px 0", borderTop: "1px solid #222", borderBottom: "1px solid #222", marginTop: "40px", flexWrap: "wrap" };
const statItemStyle: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center" };
const statNumStyle: React.CSSProperties = { fontFamily: "'Black Ops One', cursive", fontSize: "1.5rem", color: "#ff6600" };
const statLabelStyle: React.CSSProperties = { fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginTop: "2px" };
const likeButtonStyle: React.CSSProperties = { marginLeft: "auto", padding: "10px 24px", border: "2px solid #ff6600", borderRadius: "8px", fontFamily: "'Bangers', cursive", fontSize: "1rem", letterSpacing: "1px", cursor: "pointer", transition: "all 0.3s" };
const commentsSectionStyle: React.CSSProperties = { marginTop: "40px" };
const commentsHeadingStyle: React.CSSProperties = { fontFamily: "'Bangers', cursive", fontSize: "1.5rem", color: "#ff6600", letterSpacing: "1px", marginBottom: "20px" };
const commentsListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "16px", marginBottom: "30px" };
const commentCardStyle: React.CSSProperties = { background: "#141414", border: "1px solid #222", borderRadius: "12px", padding: "16px 20px" };
const commentHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" };
const commentAuthorStyle: React.CSSProperties = { fontFamily: "'Bangers', cursive", fontSize: "0.95rem", color: "#ffcc00", letterSpacing: "1px" };
const commentDateStyle: React.CSSProperties = { fontSize: "0.75rem", color: "#666" };
const commentTextStyle: React.CSSProperties = { color: "#aaa", fontSize: "0.9rem", lineHeight: "1.6", margin: 0 };
const commentActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", marginTop: "8px" };
const actionBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "#888", fontSize: "0.8rem", cursor: "pointer", padding: "2px 0", fontFamily: "'Inter', sans-serif" };
const smallBtnStyle: React.CSSProperties = { padding: "6px 16px", border: "1px solid #444", borderRadius: "6px", background: "transparent", color: "#aaa", fontSize: "0.85rem", cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: "0.5px" };
const commentFormStyle: React.CSSProperties = { background: "#141414", border: "1px solid #222", borderRadius: "12px", padding: "24px" };
const formTitleStyle: React.CSSProperties = { fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "#ffcc00", letterSpacing: "1px", marginBottom: "16px", marginTop: 0 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 16px", background: "#0a0a0a", border: "1px solid #333", borderRadius: "8px", color: "#e0e0e0", fontSize: "0.9rem", fontFamily: "'Inter', sans-serif", marginBottom: "12px", outline: "none", boxSizing: "border-box" };
const submitButtonStyle: React.CSSProperties = { padding: "12px 32px", background: "#ff6600", color: "#000", border: "none", borderRadius: "8px", fontFamily: "'Bangers', cursive", fontSize: "1rem", letterSpacing: "1px", cursor: "pointer", transition: "all 0.3s" };
