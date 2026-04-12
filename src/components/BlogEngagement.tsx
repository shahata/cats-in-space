"use client";
import React, { useState, useEffect, useCallback } from "react";
import { likes, posts } from "@wix/blog";
import { comments as commentsApi } from "@wix/comments";
import { members } from "@wix/members";
import { httpClient, i18n } from "@wix/essentials";

type Comment = commentsApi.Comment;

const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";
const BLOG_POST_FQDN = "wix.blog.v3.post";

interface Props {
  postId: string;
  referenceId: string;
  memberName?: string;
  memberPhoto?: string;
  identityId?: string;
  commentingEnabled?: boolean;
}

export default function BlogEngagement({
  postId,
  referenceId,
  memberName,
  memberPhoto,
  identityId,
  commentingEnabled = true,
}: Props) {
  const isLoggedIn = !!memberName;
  const t = i18n.getTranslationFunction();
  const [metrics, setMetrics] = useState({ views: 0, likes: 0, comments: 0 });
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [topLevelComments, setTopLevelComments] = useState<Comment[]>([]);
  const [repliesMap, setRepliesMap] = useState<Record<string, Comment[]>>({});
  const [totalComments, setTotalComments] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyName, setReplyName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [myVisitorId, setMyVisitorId] = useState<string | null>(
    identityId || null,
  );
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [memberProfiles, setMemberProfiles] = useState<
    Map<
      string,
      { nickname: string; title?: string; photo?: string; slug?: string }
    >
  >(new Map());
  const [loginRequired, setLoginRequired] = useState(false);

  useEffect(() => {
    reportView();
    loadMetrics();
    loadAllMyLikes();
    loadComments();
  }, [postId]);

  async function reportView() {
    try {
      await httpClient.fetchWithAuth(
        `https://www.wixapis.com/blog/v3/posts/${postId}/view`,
        { method: "POST" },
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

  const loadComments = useCallback(
    async (expectedMin?: number) => {
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
        const allReplies: Comment[] = [];
        if (res.commentReplies) {
          for (const replyData of Object.values(res.commentReplies)) {
            allReplies.push(
              ...((replyData as { replies?: Comment[] }).replies || []),
            );
          }
        }

        // Also collect replies mixed into the flat comments list
        const topLevel: Comment[] = [];
        for (const c of allComments) {
          const parentId = c.parentComment?._id;
          if (parentId) {
            allReplies.push(c);
          } else {
            topLevel.push(c);
          }
        }

        // Deduplicate replies by ID
        const seen = new Set<string>();
        const uniqueReplies: Comment[] = [];
        for (const r of allReplies) {
          const rid = r._id;
          if (rid && !seen.has(rid)) {
            seen.add(rid);
            uniqueReplies.push(r);
          }
        }

        // Group replies by their ACTUAL parent (not the top-level comment)
        const rm: Record<string, Comment[]> = {};
        for (const r of uniqueReplies) {
          const parentId = r.parentComment?._id;
          if (parentId) {
            if (!rm[parentId]) rm[parentId] = [];
            rm[parentId].push(r);
          }
        }

        const replyCount = Object.values(rm).reduce(
          (sum, r) => sum + r.length,
          0,
        );
        const total = topLevel.length + replyCount;
        setTopLevelComments(topLevel);
        setRepliesMap(rm);
        setTotalComments(total);

        // Retry if we expected more comments (eventual consistency)
        if (expectedMin && total < expectedMin) {
          setTimeout(() => loadComments(expectedMin), 2000);
        }

        // Load member profiles for comments authored by members
        const allWithReplies = [...topLevel, ...uniqueReplies];
        const memberIds = new Set<string>();
        for (const c of allWithReplies) {
          if (c.author?.memberId) memberIds.add(c.author.memberId);
        }
        if (memberIds.size > 0) {
          loadMemberProfiles(memberIds);
        }
      } catch {}
    },
    [referenceId],
  );

  async function loadMemberProfiles(memberIds: Set<string>) {
    const profiles = new Map(memberProfiles);
    await Promise.all(
      [...memberIds]
        .filter((id) => !profiles.has(id))
        .map(async (id) => {
          try {
            const m = await members.getMember(id, { fieldsets: ["FULL"] });
            const nickname = m.profile?.nickname || m.contact?.firstName;
            if (nickname) {
              const entry: {
                nickname: string;
                title?: string;
                photo?: string;
                slug?: string;
              } = { nickname };
              if (m.profile?.title) entry.title = m.profile.title;
              if (m.profile?.photo?.url) entry.photo = m.profile.photo.url;
              if (m.profile?.slug) entry.slug = m.profile.slug;
              profiles.set(id, entry);
            }
          } catch {}
        }),
    );
    setMemberProfiles(profiles);
  }

  async function loadAllMyLikes() {
    // queryLikes returns all likes by the current visitor (posts + comments)
    try {
      const res = await likes.queryLikes().limit(100).find();
      const likedIds = new Set<string>();
      for (const like of res.items) {
        if (like.entityId) {
          likedIds.add(like.entityId);
          if (like.entityId === postId) setLiked(true);
        }
      }
      setLikedCommentIds(likedIds);
    } catch {}
  }

  async function toggleLike() {
    setLikeLoading(true);
    try {
      if (liked) {
        await likes.deleteLikeByFqdnAndEntityId({
          fqdn: BLOG_POST_FQDN,
          entityId: postId,
        });
        setLiked(false);
        setMetrics((m) => ({ ...m, likes: Math.max(0, m.likes - 1) }));
      } else {
        await likes.createLike({
          like: { fqdn: BLOG_POST_FQDN, entityId: postId },
        });
        setLiked(true);
        setMetrics((m) => ({ ...m, likes: m.likes + 1 }));
      }
    } catch (e) {
      console.error("Like error:", e);
    }
    setLikeLoading(false);
  }

  function makeRichContent(text: string): commentsApi.CommentContent {
    return {
      richContent: {
        nodes: [
          {
            type: "PARAGRAPH" as const,
            nodes: [
              { type: "TEXT" as const, textData: { text, decorations: [] } },
            ],
            paragraphData: {},
          },
        ],
      },
    };
  }

  function captureIdentity(comment: Comment | undefined) {
    const vid = comment?.author?.visitorId || comment?.author?.memberId;
    if (vid) setMyVisitorId(vid);
  }

  function isPermissionDenied(e: unknown): boolean {
    if (typeof e !== "object" || e === null) return false;
    const err = e as Record<string, unknown>;
    const details = err.details as Record<string, unknown> | undefined;
    const appError = details?.applicationError as
      | Record<string, unknown>
      | undefined;
    return (
      appError?.code === "PERMISSION_DENIED" ||
      details?.httpStatusCode === 403 ||
      (typeof err.message === "string" &&
        err.message.includes("Permission denied"))
    );
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.createComment({
        appId: BLOG_APP_ID,
        contextId: referenceId,
        resourceId: referenceId,
        author: (isLoggedIn
          ? {}
          : {
              authorName: commentName.trim() || t("blog.anonymousCat"),
            }) as commentsApi.CommentAuthor,
        content: makeRichContent(newComment.trim()),
      });
      captureIdentity(created);
      setNewComment("");
      setCommentName("");
      await loadComments(totalComments + 1);
    } catch (e) {
      if (isPermissionDenied(e)) {
        setLoginRequired(true);
      } else {
        console.error("Comment error:", e);
      }
    }
    setSubmitting(false);
  }

  async function submitReply(parentId: string) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.createComment({
        appId: BLOG_APP_ID,
        contextId: referenceId,
        resourceId: referenceId,
        author: (isLoggedIn
          ? {}
          : {
              authorName: replyName.trim() || t("blog.anonymousCat"),
            }) as commentsApi.CommentAuthor,
        parentComment: { _id: parentId },
        content: makeRichContent(replyText.trim()),
      });
      captureIdentity(created);
      setReplyText("");
      setReplyName("");
      setReplyingTo(null);
      await loadComments(totalComments + 1);
    } catch (e) {
      if (isPermissionDenied(e)) {
        setLoginRequired(true);
      } else {
        console.error("Reply error:", e);
      }
    }
    setSubmitting(false);
  }

  async function handleEdit(commentId: string, revision: string) {
    if (!editText.trim()) return;
    try {
      await commentsApi.updateComment(commentId, {
        revision,
        content: makeRichContent(editText.trim()),
      } as commentsApi.UpdateComment);
      setEditingId(null);
      setEditText("");
      await loadComments();
    } catch (e) {
      console.error("Edit error:", e);
    }
  }

  async function toggleCommentLike(comment: Comment) {
    const cid = comment._id;
    if (!cid) {
      console.error("No comment ID for like");
      return;
    }
    const isLiked = likedCommentIds.has(cid);
    try {
      if (isLiked) {
        await likes.deleteLikeByFqdnAndEntityId({
          fqdn: BLOG_POST_FQDN,
          entityId: cid,
        });
        setLikedCommentIds((prev) => {
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
      } else {
        await likes.createLike({
          like: { fqdn: BLOG_POST_FQDN, entityId: cid },
        });
        setLikedCommentIds((prev) => new Set(prev).add(cid));
      }
    } catch (e) {
      console.error("Comment like error:", e);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm(t("blog.deleteConfirm"))) return;
    try {
      await commentsApi.deleteComment(commentId);
      await loadComments();
      await loadMetrics();
    } catch (e) {
      console.error("Delete error:", e);
    }
  }

  function getAuthorDisplay(comment: Comment): {
    name: string;
    title?: string;
    photo?: string;
    profileUrl?: string;
    isMember: boolean;
  } {
    const memberId = comment.author?.memberId;
    if (memberId) {
      const profile = memberProfiles.get(memberId);
      if (profile) {
        const result: {
          name: string;
          title?: string;
          photo?: string;
          profileUrl?: string;
          isMember: boolean;
        } = {
          name: profile.nickname,
          profileUrl: `/member/${profile.slug || memberId}`,
          isMember: true,
        };
        if (profile.title) result.title = profile.title;
        if (profile.photo) result.photo = profile.photo;
        return result;
      }
    }
    const authorName = (comment.author as { authorName?: string })?.authorName;
    return { name: authorName || t("blog.spaceVisitor"), isMember: false };
  }

  function isOwnComment(comment: Comment): boolean {
    if (!myVisitorId) return false;
    return (
      (comment.author?.visitorId ||
        comment.author?.memberId ||
        comment.author?.userId) === myVisitorId
    );
  }

  function getCommentText(comment: Comment): string {
    const nodes = comment.content?.richContent?.nodes || [];
    const texts: string[] = [];
    for (const node of nodes) {
      if (node.type === "PARAGRAPH") {
        for (const child of node.nodes || []) {
          if (child.type === "TEXT" && child.textData?.text)
            texts.push(child.textData.text);
        }
      }
    }
    return texts.join(" ");
  }

  function formatDate(dateStr: string | Date | null | undefined) {
    if (!dateStr) return "";
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    return d.toLocaleDateString(i18n.getLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderReplyThread(reply: Comment, depth: number): React.ReactNode {
    const rAuthorInfo = getAuthorDisplay(reply);
    const rAuthor = rAuthorInfo.name;
    const rText = getCommentText(reply);
    const rIsMine = isOwnComment(reply);
    const rIsEditing = editingId === reply._id;
    const replyId = reply._id!;
    const nestedReplies = repliesMap[replyId] || [];
    const indent = Math.min(depth * 24, 72);

    return (
      <div
        key={replyId + "-" + myVisitorId}
        style={{
          ...commentCardStyle,
          marginInlineStart: indent,
          borderLeft: "2px solid #333",
        }}
      >
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {rAuthorInfo.profileUrl ? (
              <a href={rAuthorInfo.profileUrl} style={authorLinkStyle}>
                {rAuthorInfo.photo && (
                  <img
                    src={rAuthorInfo.photo}
                    alt={rAuthor}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span style={commentAuthorStyle}>{rAuthor}</span>
              </a>
            ) : (
              <>
                {rAuthorInfo.photo && (
                  <img
                    src={rAuthorInfo.photo}
                    alt={rAuthor}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span style={commentAuthorStyle}>{rAuthor}</span>
              </>
            )}
            {rAuthorInfo.isMember && (
              <span style={memberBadgeStyle}>{t("blog.crew")}</span>
            )}
            {rAuthorInfo.title && (
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#666",
                  fontStyle: "italic",
                }}
              >
                {rAuthorInfo.title}
              </span>
            )}
            {reply.contentEdited && (
              <span style={editedBadgeStyle}>{t("blog.edited")}</span>
            )}
          </div>
          <span style={commentDateStyle}>{formatDate(reply._createdDate)}</span>
        </div>
        {rIsEditing ? (
          <div style={{ marginTop: "8px" }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              style={{
                ...inputStyle,
                marginBottom: "8px",
                resize: "vertical" as const,
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => handleEdit(replyId, reply.revision!)}
                style={{
                  ...smallBtnStyle,
                  background: "#ff6600",
                  color: "#000",
                }}
              >
                {t("blog.save")}
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditText("");
                }}
                style={smallBtnStyle}
              >
                {t("blog.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p style={commentTextStyle}>{rText}</p>
        )}
        {!rIsEditing && (
          <div style={commentActionsStyle}>
            <button
              onClick={() => toggleCommentLike(reply)}
              style={{
                ...actionBtnStyle,
                color: likedCommentIds.has(replyId) ? "#ff6600" : "#888",
              }}
            >
              {likedCommentIds.has(replyId)
                ? t("blog.likedComment")
                : t("blog.likeComment")}
            </button>
            {commentingEnabled && !loginRequired && (
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === replyId ? null : replyId);
                  setReplyText("");
                  setReplyName("");
                }}
                style={actionBtnStyle}
              >
                {t("blog.reply")}
              </button>
            )}
            {rIsMine && (
              <>
                <button
                  onClick={() => {
                    setEditingId(replyId);
                    setEditText(rText);
                  }}
                  style={actionBtnStyle}
                >
                  {t("blog.edit")}
                </button>
                <button
                  onClick={() => handleDelete(replyId)}
                  style={{ ...actionBtnStyle, color: "#cc0000" }}
                >
                  {t("blog.delete")}
                </button>
              </>
            )}
          </div>
        )}
        {replyingTo === replyId && (
          <div
            style={{
              marginTop: "12px",
              paddingTop: "12px",
              borderTop: "1px solid #222",
            }}
          >
            {isLoggedIn ? (
              <div style={{ ...memberIndicatorStyle, marginBottom: "8px" }}>
                {memberPhoto && (
                  <img
                    src={memberPhoto}
                    alt={memberName}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>
                  {t("blog.replyingAs")}{" "}
                  <strong style={{ color: "#ffcc00" }}>{memberName}</strong>
                </span>
              </div>
            ) : (
              <input
                type="text"
                placeholder={t("blog.yourName")}
                value={replyName}
                onChange={(e) => setReplyName(e.target.value)}
                style={{ ...inputStyle, marginBottom: "8px" }}
              />
            )}
            <textarea
              placeholder={t("blog.writeReply")}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              style={{
                ...inputStyle,
                marginBottom: "8px",
                resize: "vertical" as const,
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => submitReply(replyId)}
                disabled={submitting}
                style={{
                  ...smallBtnStyle,
                  background: "#ff6600",
                  color: "#000",
                }}
              >
                {submitting ? t("blog.sending") : t("blog.sendReply")}
              </button>
              <button onClick={() => setReplyingTo(null)} style={smallBtnStyle}>
                {t("blog.cancel")}
              </button>
            </div>
          </div>
        )}
        {nestedReplies.length > 0 && (
          <div style={{ marginTop: "8px" }}>
            {nestedReplies.map((nr) => renderReplyThread(nr, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const commentElements = topLevelComments.map((comment) => {
    const commentId = comment._id!;
    const authorInfo = getAuthorDisplay(comment);
    const text = getCommentText(comment);

    const replies = repliesMap[commentId] || [];
    const isEditing = editingId === commentId;
    const isMine = isOwnComment(comment);

    return (
      <div key={commentId + "-" + myVisitorId} style={commentCardStyle}>
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {authorInfo.profileUrl ? (
              <a href={authorInfo.profileUrl} style={authorLinkStyle}>
                {authorInfo.photo && (
                  <img
                    src={authorInfo.photo}
                    alt={authorInfo.name}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span style={commentAuthorStyle}>{authorInfo.name}</span>
              </a>
            ) : (
              <>
                {authorInfo.photo && (
                  <img
                    src={authorInfo.photo}
                    alt={authorInfo.name}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span style={commentAuthorStyle}>{authorInfo.name}</span>
              </>
            )}
            {authorInfo.isMember && (
              <span style={memberBadgeStyle}>{t("blog.crew")}</span>
            )}
            {authorInfo.title && (
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#666",
                  fontStyle: "italic",
                }}
              >
                {authorInfo.title}
              </span>
            )}
            {comment.contentEdited && (
              <span style={editedBadgeStyle}>{t("blog.edited")}</span>
            )}
          </div>
          <span style={commentDateStyle}>
            {formatDate(comment._createdDate)}
          </span>
        </div>

        {isEditing ? (
          <div style={{ marginTop: "8px" }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              style={{
                ...inputStyle,
                marginBottom: "8px",
                resize: "vertical" as const,
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => handleEdit(commentId, comment.revision!)}
                style={{
                  ...smallBtnStyle,
                  background: "#ff6600",
                  color: "#000",
                }}
              >
                {t("blog.save")}
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditText("");
                }}
                style={smallBtnStyle}
              >
                {t("blog.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p style={commentTextStyle}>{text}</p>
        )}

        {!isEditing && (
          <div style={commentActionsStyle}>
            <button
              onClick={() => toggleCommentLike(comment)}
              style={{
                ...actionBtnStyle,
                color: likedCommentIds.has(commentId) ? "#ff6600" : "#888",
              }}
            >
              {likedCommentIds.has(commentId)
                ? t("blog.likedComment")
                : t("blog.likeComment")}
            </button>
            {commentingEnabled && !loginRequired && (
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === commentId ? null : commentId);
                  setReplyText("");
                  setReplyName("");
                }}
                style={actionBtnStyle}
              >
                {t("blog.reply")}
                {replies.length > 0 ? ` (${replies.length})` : ""}
              </button>
            )}
            {isMine && (
              <>
                <button
                  onClick={() => {
                    setEditingId(commentId);
                    setEditText(text);
                  }}
                  style={actionBtnStyle}
                >
                  {t("blog.edit")}
                </button>
                <button
                  onClick={() => handleDelete(commentId)}
                  style={{ ...actionBtnStyle, color: "#cc0000" }}
                >
                  {t("blog.delete")}
                </button>
              </>
            )}
          </div>
        )}

        {replyingTo === commentId && (
          <div
            style={{
              marginTop: "12px",
              paddingTop: "12px",
              borderTop: "1px solid #222",
            }}
          >
            {isLoggedIn ? (
              <div style={{ ...memberIndicatorStyle, marginBottom: "8px" }}>
                {memberPhoto && (
                  <img
                    src={memberPhoto}
                    alt={memberName}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>
                  {t("blog.replyingAs")}{" "}
                  <strong style={{ color: "#ffcc00" }}>{memberName}</strong>
                </span>
              </div>
            ) : (
              <input
                type="text"
                placeholder={t("blog.yourName")}
                value={replyName}
                onChange={(e) => setReplyName(e.target.value)}
                style={{ ...inputStyle, marginBottom: "8px" }}
              />
            )}
            <textarea
              placeholder={t("blog.writeReply")}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              style={{
                ...inputStyle,
                marginBottom: "8px",
                resize: "vertical" as const,
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => submitReply(commentId)}
                disabled={submitting}
                style={{
                  ...smallBtnStyle,
                  background: "#ff6600",
                  color: "#000",
                }}
              >
                {submitting ? t("blog.sending") : t("blog.sendReply")}
              </button>
              <button onClick={() => setReplyingTo(null)} style={smallBtnStyle}>
                {t("blog.cancel")}
              </button>
            </div>
          </div>
        )}

        {replies.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {replies.map((reply) => renderReplyThread(reply, 1))}
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
          <span style={statLabelStyle}>{t("blog.views")}</span>
        </div>
        <div style={statItemStyle}>
          <span style={statNumStyle}>{metrics.likes}</span>
          <span style={statLabelStyle}>{t("blog.likes")}</span>
        </div>
        <div style={statItemStyle}>
          <span style={statNumStyle}>{totalComments}</span>
          <span style={statLabelStyle}>{t("blog.comments")}</span>
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
          {liked ? t("blog.liked") : t("blog.likePost")}
        </button>
      </div>

      <div style={commentsSectionStyle}>
        <h3 style={commentsHeadingStyle}>
          {t("blog.transmissions", { count: totalComments.toString() })}
        </h3>
        {commentElements.length > 0 && (
          <div style={commentsListStyle}>{commentElements}</div>
        )}

        {!commentingEnabled ? (
          <div style={{ ...commentFormStyle, textAlign: "center" as const }}>
            <p
              style={{ color: "#666", fontSize: "0.9rem", fontStyle: "italic" }}
            >
              {t("blog.commentsDisabled")}
            </p>
          </div>
        ) : loginRequired ? (
          <div style={{ ...commentFormStyle, textAlign: "center" as const }}>
            <h4 style={formTitleStyle}>{t("blog.loginRequired")}</h4>
            <p
              style={{
                color: "#888",
                fontSize: "0.85rem",
                marginBottom: "16px",
              }}
            >
              {t("blog.loginToComment")}
            </p>
            <a
              href={`/api/auth/login?returnToUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
              style={loginLinkStyle}
            >
              {t("blog.loginSignUp")}
            </a>
          </div>
        ) : (
          <form onSubmit={submitComment} style={commentFormStyle}>
            <h4 style={formTitleStyle}>{t("blog.leaveTransmission")}</h4>
            {isLoggedIn ? (
              <div style={memberIndicatorStyle}>
                {memberPhoto && (
                  <img
                    src={memberPhoto}
                    alt={memberName}
                    style={avatarStyle}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>
                  {t("blog.commentingAs")}{" "}
                  <strong style={{ color: "#ffcc00" }}>{memberName}</strong>
                </span>
              </div>
            ) : (
              <input
                type="text"
                placeholder={t("blog.yourName")}
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                style={inputStyle}
              />
            )}
            <textarea
              placeholder={t("blog.writeMessage")}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" as const }}
              required
            />
            <button
              type="submit"
              disabled={submitting}
              style={submitButtonStyle}
            >
              {submitting ? t("blog.transmitting") : t("blog.sendTransmission")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const loginLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 24px",
  background: "#ff6600",
  color: "#000",
  fontFamily: "'Bangers', cursive",
  fontSize: "0.9rem",
  letterSpacing: "1px",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: "bold",
};
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
  marginInlineStart: "auto",
  padding: "10px 24px",
  border: "2px solid #ff6600",
  borderRadius: "8px",
  fontFamily: "'Bangers', cursive",
  fontSize: "1rem",
  letterSpacing: "1px",
  cursor: "pointer",
  transition: "all 0.3s",
};
const commentsSectionStyle: React.CSSProperties = { marginTop: "40px" };
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
  flexWrap: "wrap",
  gap: "8px",
};
const commentAuthorStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive",
  fontSize: "0.95rem",
  color: "#ffcc00",
  letterSpacing: "1px",
};
const authorLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  textDecoration: "none",
};
const memberIndicatorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "0.85rem",
  color: "#888",
  marginBottom: "12px",
};
const editedBadgeStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#555",
  fontStyle: "italic",
};
const avatarStyle: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  objectFit: "cover",
  border: "1px solid #ff6600",
};
const memberBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 8px",
  background: "rgba(255, 102, 0, 0.15)",
  border: "1px solid rgba(255, 102, 0, 0.3)",
  borderRadius: "10px",
  fontSize: "0.6rem",
  color: "#ff6600",
  fontWeight: 700,
  textTransform: "uppercase",
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
const commentActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "8px",
};
const actionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  fontSize: "0.8rem",
  cursor: "pointer",
  padding: "2px 0",
  fontFamily: "'Inter', sans-serif",
};
const smallBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  border: "1px solid #444",
  borderRadius: "6px",
  background: "transparent",
  color: "#aaa",
  fontSize: "0.85rem",
  cursor: "pointer",
  fontFamily: "'Bangers', cursive",
  letterSpacing: "0.5px",
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
