"use client";
import React, { useState } from "react";
import { members } from "@wix/members";

interface Props {
  member: any;
}

export default function MemberProfile({ member }: Props) {
  const [nickname, setNickname] = useState(member.profile?.nickname || "");
  const [title, setTitle] = useState(member.profile?.title || "");
  const [firstName, setFirstName] = useState(member.contact?.firstName || "");
  const [lastName, setLastName] = useState(member.contact?.lastName || "");
  const [company, setCompany] = useState(member.contact?.company || "");
  const [jobTitle, setJobTitle] = useState(member.contact?.jobTitle || "");
  const [birthdate, setBirthdate] = useState(member.contact?.birthdate || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const photo = member.profile?.photo?.url;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await members.updateMember(member._id, {
        profile: {
          nickname: nickname || undefined,
          title: title || undefined,
        },
        contact: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          company: company || undefined,
          jobTitle: jobTitle || undefined,
          birthdate: birthdate || undefined,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to update profile");
    }
    setSaving(false);
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      {/* Profile header */}
      <div style={headerStyle}>
        {photo ? (
          <img src={photo} alt={nickname} style={photoStyle} />
        ) : (
          <div style={photoPlaceholderStyle}>?</div>
        )}
        <div>
          <div style={headerNameStyle}>{nickname || firstName || "Unnamed Cat"}</div>
          {title && <div style={headerTitleStyle}>{title}</div>}
          <div style={headerEmailStyle}>{member.loginEmail}</div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Public Profile */}
        <h3 style={sectionHeadingStyle}>Public Profile</h3>
        <p style={sectionDescStyle}>Visible to other crew members and visitors</p>

        <label style={labelStyle}>Nickname</label>
        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
          placeholder="How others see you" style={inputStyle} />

        <label style={labelStyle}>Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chief Napping Officer" style={inputStyle} />

        {/* Private Info */}
        <h3 style={{ ...sectionHeadingStyle, marginTop: "40px" }}>Private Info</h3>
        <p style={sectionDescStyle}>Only visible to site administrators</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>First Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
              style={inputStyle} />
          </div>
        </div>

        <label style={labelStyle}>Company</label>
        <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
          style={inputStyle} />

        <label style={labelStyle}>Job Title</label>
        <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
          style={inputStyle} />

        <label style={labelStyle}>Birthdate</label>
        <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)}
          style={inputStyle} />

        {/* Actions */}
        <div style={{ marginTop: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
          <button type="submit" disabled={saving} style={saveButtonStyle}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span style={{ color: "#4caf50", fontSize: "0.9rem" }}>Profile updated!</span>}
          {error && <span style={{ color: "#cc0000", fontSize: "0.9rem" }}>{error}</span>}
        </div>
      </form>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "20px",
  padding: "24px", background: "#141414", border: "1px solid #222",
  borderRadius: "16px", marginBottom: "32px",
};
const photoStyle: React.CSSProperties = {
  width: "80px", height: "80px", borderRadius: "50%",
  objectFit: "cover", border: "3px solid #ff6600",
};
const photoPlaceholderStyle: React.CSSProperties = {
  width: "80px", height: "80px", borderRadius: "50%",
  background: "#1a1a1a", display: "flex", alignItems: "center",
  justifyContent: "center", fontFamily: "'Black Ops One', cursive",
  fontSize: "2rem", color: "#444", border: "3px solid #333",
};
const headerNameStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive", fontSize: "1.5rem",
  color: "#ffcc00", letterSpacing: "1px",
};
const headerTitleStyle: React.CSSProperties = {
  fontSize: "0.85rem", color: "#ff6600", fontStyle: "italic",
};
const headerEmailStyle: React.CSSProperties = {
  fontSize: "0.8rem", color: "#666", marginTop: "4px",
};
const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive", fontSize: "1.3rem",
  color: "#ff6600", letterSpacing: "1px", marginBottom: "4px",
};
const sectionDescStyle: React.CSSProperties = {
  fontSize: "0.8rem", color: "#666", marginBottom: "16px",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.8rem", color: "#888",
  textTransform: "uppercase", letterSpacing: "1px",
  marginBottom: "4px", marginTop: "12px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#0a0a0a",
  border: "1px solid #333", borderRadius: "8px", color: "#e0e0e0",
  fontSize: "0.9rem", fontFamily: "'Inter', sans-serif",
  outline: "none", boxSizing: "border-box",
};
const saveButtonStyle: React.CSSProperties = {
  padding: "12px 32px", background: "#ff6600", color: "#000",
  border: "none", borderRadius: "8px", fontFamily: "'Bangers', cursive",
  fontSize: "1rem", letterSpacing: "1px", cursor: "pointer",
  transition: "all 0.3s",
};
