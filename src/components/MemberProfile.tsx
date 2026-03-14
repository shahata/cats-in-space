"use client";
import React, { useState } from "react";
import { members, authentication, membersAbout } from "@wix/members";
import { getData as getCountries } from "country-list";

function toE164(phone: string): string {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  // If it's 10 digits, assume US and prepend +1
  if (cleaned.length === 10) return `+1${cleaned}`;
  // Otherwise prepend +
  return `+${cleaned}`;
}

interface Props {
  member: any;
}

export default function MemberProfile({ member }: Props) {
  // Public profile
  const [nickname, setNickname] = useState(member.profile?.nickname || "");
  const [title, setTitle] = useState(member.profile?.title || "");
  const [slug, setSlug] = useState(member.profile?.slug || "");
  const [privacyStatus, setPrivacyStatus] = useState(member.privacyStatus || "PUBLIC");

  // Contact info
  const [firstName, setFirstName] = useState(member.contact?.firstName || "");
  const [lastName, setLastName] = useState(member.contact?.lastName || "");
  const [company, setCompany] = useState(member.contact?.company || "");
  const [jobTitle, setJobTitle] = useState(member.contact?.jobTitle || "");
  const [birthdate, setBirthdate] = useState(member.contact?.birthdate || "");
  const [phone, setPhone] = useState(member.contact?.phones?.[0] || "");

  // Address
  const addr = member.contact?.addresses?.[0] || {};
  const [addressLine, setAddressLine] = useState(addr.addressLine || "");
  const [addressLine2, setAddressLine2] = useState(addr.addressLine2 || "");
  const [city, setCity] = useState(addr.city || "");
  const [subdivision, setSubdivision] = useState(addr.subdivision || "");
  const [country, setCountry] = useState(addr.country || "");
  const [postalCode, setPostalCode] = useState(addr.postalCode || "");

  // Credentials
  const [newEmail, setNewEmail] = useState("");
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordSending, setPasswordSending] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [photo, setPhoto] = useState<string | undefined>(member.profile?.photo?.url);
  const [photoId, setPhotoId] = useState<string | undefined>(member.profile?.photo?._id);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [cover, setCover] = useState<string | undefined>(member.profile?.cover?.url);
  const [coverUploading, setCoverUploading] = useState(false);
  const [about, setAbout] = useState("");
  const [aboutId, setAboutId] = useState<string | null>(null);
  const [aboutRevision, setAboutRevision] = useState<string | null>(null);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutSaved, setAboutSaved] = useState(false);

  // Load existing about on mount
  React.useEffect(() => {
    (async () => {
      try {
        const res = await membersAbout.getMyMemberAbout();
        const aboutData = res.memberAbout;
        if (aboutData) {
          setAboutId(aboutData._id || null);
          setAboutRevision(aboutData.revision || null);
          const nodes = aboutData.content?.nodes || [];
          const texts: string[] = [];
          for (const node of nodes) {
            if (node.type === "PARAGRAPH") {
              for (const child of (node as any).nodes || []) {
                if (child.type === "TEXT" && child.textData?.text) texts.push(child.textData.text);
              }
            }
          }
          setAbout(texts.join("\n"));
        }
      } catch {}
    })();
  }, []);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("memberId", member._id);

      const res = await fetch("/api/profile-photo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.id && data.url) {
        setPhotoId(data.id);
        setPhoto(data.url);
        setRemovePhoto(false);
      } else {
        alert(data.error || "Failed to upload image");
      }
    } catch (err: any) {
      alert(err?.message || "Upload failed");
    }
    setPhotoUploading(false);
  }

  async function handleRemovePhoto() {
    setPhoto(undefined);
    setPhotoId(undefined);
    setRemovePhoto(true);
    try {
      const res = await fetch("/api/profile-photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member._id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to remove photo");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to remove photo");
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("memberId", member._id);
      formData.append("field", "cover");
      const res = await fetch("/api/profile-photo", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        setCover(data.url);
      } else {
        alert(data.error || "Failed to upload cover");
      }
    } catch (err: any) {
      alert(err?.message || "Upload failed");
    }
    setCoverUploading(false);
  }

  async function handleRemoveCover() {
    setCover(undefined);
    try {
      const res = await fetch("/api/profile-photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member._id, field: "cover" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to remove cover");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to remove cover");
    }
  }

  function makeAboutContent(text: string) {
    return {
      nodes: text.split("\n").map(line => ({
        type: "PARAGRAPH" as const,
        nodes: [{ type: "TEXT" as const, textData: { text: line, decorations: [] } }],
        paragraphData: {},
      })),
    };
  }

  async function handleSaveAbout() {
    setAboutSaving(true);
    try {
      const content = makeAboutContent(about);
      if (aboutId && aboutRevision) {
        const res = await membersAbout.updateMemberAbout(aboutId, { content, revision: aboutRevision });
        setAboutRevision(res.revision || aboutRevision);
        setAboutSaved(true);
      } else {
        const res = await membersAbout.createMemberAbout({ memberId: member._id, content } as any);
        setAboutId(res._id || null);
        setAboutRevision(res.revision || null);
        setAboutSaved(true);
      }
      setTimeout(() => setAboutSaved(false), 3000);
    } catch (e: any) {
      alert(e?.message || "Failed to save about");
    }
    setAboutSaving(false);
  }

  async function handleChangeEmail() {
    if (!newEmail.trim()) return;
    setEmailChanging(true);
    setEmailMsg("");
    try {
      // Must be called as the member (not elevated) — requires Member identity
      await authentication.changeLoginEmail(member._id, newEmail.trim());
      setEmailMsg("Login email updated! You may need to log in again.");
      setNewEmail("");
    } catch (e: any) {
      setEmailMsg(e?.message || "Failed to change email");
    }
    setEmailChanging(false);
  }

  async function handleResetPassword() {
    setPasswordSending(true);
    setPasswordMsg("");
    try {
      await authentication.sendSetPasswordEmail(member.loginEmail);
      setPasswordMsg("Password reset email sent! Check your inbox.");
    } catch (e: any) {
      setPasswordMsg(e?.message || "Failed to send reset email");
    }
    setPasswordSending(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const profileUpdate: any = {
        nickname: nickname || undefined,
        title: title || undefined,
      };

      await members.updateMember(member._id, {
        profile: profileUpdate,
        contact: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          company: company || undefined,
          jobTitle: jobTitle || undefined,
          birthdate: birthdate || undefined,
          phones: phone ? [toE164(phone)] : [],
          addresses: [{
            ...(addr._id ? { _id: addr._id } : {}),
            addressLine: addressLine || undefined,
            addressLine2: addressLine2 || undefined,
            city: city || undefined,
            subdivision: subdivision || undefined,
            country: country || undefined,
            postalCode: postalCode || undefined,
          }],
        },
      });

      // Privacy is controlled via joinCommunity/leaveCommunity, not updateMember
      const currentPrivacy = member.privacyStatus || "PUBLIC";
      if (privacyStatus !== currentPrivacy) {
        if (privacyStatus === "PUBLIC") {
          await members.joinCommunity();
        } else {
          await members.leaveCommunity();
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e?.message || "Failed to update profile");
    }
    setSaving(false);
  }

  async function handleSlugUpdate() {
    if (!slug.trim()) return;
    setSlugSaving(true);
    try {
      await members.updateCurrentMemberSlug(slug.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e?.message || "Failed to update slug");
    }
    setSlugSaving(false);
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      {/* Cover photo */}
      <div style={coverWrapperStyle}>
        {cover ? (
          <img src={cover} alt="Cover" style={coverImageStyle} referrerPolicy="no-referrer" />
        ) : (
          <div style={coverPlaceholderStyle}>No cover photo</div>
        )}
        <div style={coverActionsStyle}>
          <label style={photoUploadLabelStyle}>
            {coverUploading ? "..." : "Change Cover"}
            <input type="file" accept="image/*" onChange={handleCoverUpload}
              style={{ display: "none" }} disabled={coverUploading} />
          </label>
          {cover && (
            <button type="button" onClick={handleRemoveCover} style={photoRemoveBtnStyle}>Remove</button>
          )}
        </div>
      </div>

      {/* Profile header */}
      <div style={{ ...headerStyle, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: "-1px" }}>
        <div style={{ position: "relative" }}>
          {photo ? (
            <img src={photo} alt={nickname} style={photoStyle} referrerPolicy="no-referrer" />
          ) : (
            <div style={photoPlaceholderStyle}>?</div>
          )}
          <div style={photoActionsStyle}>
            <label style={photoUploadLabelStyle}>
              {photoUploading ? "..." : "Change"}
              <input type="file" accept="image/*" onChange={handlePhotoUpload}
                style={{ display: "none" }} disabled={photoUploading} />
            </label>
            {photo && (
              <button type="button" onClick={handleRemovePhoto} style={photoRemoveBtnStyle}>Remove</button>
            )}
          </div>
        </div>
        <div>
          <div style={headerNameStyle}>{nickname || firstName || "Unnamed Cat"}</div>
          {title && <div style={headerTitleStyle}>{title}</div>}
          <div style={headerEmailStyle}>{member.loginEmail}</div>
          <div style={headerMetaStyle}>
            Member since {member._createdDate ? new Date(member._createdDate).toLocaleDateString() : "unknown"}
            {member.lastLoginDate && <> · Last login {new Date(member.lastLoginDate).toLocaleDateString()}</>}
          </div>
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

        <label style={labelStyle}>Profile Slug</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
            placeholder="my-profile-url" style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={handleSlugUpdate} disabled={slugSaving}
            style={{ ...smallButtonStyle, marginTop: 0 }}>
            {slugSaving ? "..." : "Update"}
          </button>
        </div>

        <label style={labelStyle}>Privacy</label>
        <select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value)} style={inputStyle}>
          <option value="PUBLIC">Public — visible to everyone</option>
          <option value="PRIVATE">Private — visible only to site admins</option>
        </select>

        {/* Private Info */}
        {/* About */}
        <h3 style={{ ...sectionHeadingStyle, marginTop: "40px" }}>About</h3>
        <p style={sectionDescStyle}>Tell other crew members about yourself</p>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)}
          placeholder="Write something about yourself..." rows={4}
          style={{ ...inputStyle, resize: "vertical" as const }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
          <button type="button" onClick={handleSaveAbout} disabled={aboutSaving}
            style={smallButtonStyle}>
            {aboutSaving ? "Saving..." : "Save About"}
          </button>
          {aboutSaved && <span style={{ color: "#4caf50", fontSize: "0.8rem" }}>Saved!</span>}
        </div>

        <h3 style={{ ...sectionHeadingStyle, marginTop: "40px" }}>Personal Info</h3>
        <p style={sectionDescStyle}>Only visible to site administrators</p>

        <div style={gridStyle}>
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

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Company</label>
            <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Job Title</label>
            <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              style={inputStyle} />
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+12025551234 (E.164 format)" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Birthdate</label>
            <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)}
              style={inputStyle} />
          </div>
        </div>

        {/* Address */}
        <h3 style={{ ...sectionHeadingStyle, marginTop: "40px" }}>Address</h3>
        <p style={sectionDescStyle}>Only visible to site administrators</p>

        <label style={labelStyle}>Address Line 1</label>
        <input type="text" value={addressLine} onChange={(e) => setAddressLine(e.target.value)}
          placeholder="Street and number" style={inputStyle} />

        <label style={labelStyle}>Address Line 2</label>
        <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Apartment, suite, floor" style={inputStyle} />

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Postal Code</label>
            <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
              <option value="">Select country...</option>
              {getCountries().map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>State / Province</label>
            <input type="text" value={subdivision} onChange={(e) => setSubdivision(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
          <button type="submit" disabled={saving} style={saveButtonStyle}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span style={{ color: "#4caf50", fontSize: "0.9rem" }}>Profile updated!</span>}
        </div>
      </form>

      {/* Login Credentials */}
      <h3 style={{ ...sectionHeadingStyle, marginTop: "48px" }}>Login Credentials</h3>
      <p style={sectionDescStyle}>Change your login email or reset your password</p>

      <div style={{ background: "#141414", border: "1px solid #222", borderRadius: "12px", padding: "24px" }}>
        <label style={labelStyle}>Current Login Email</label>
        <p style={{ color: "#e0e0e0", fontSize: "0.9rem", marginBottom: "16px" }}>{member.loginEmail}</p>

        <label style={labelStyle}>New Login Email</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com" style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={handleChangeEmail} disabled={emailChanging}
            style={smallButtonStyle}>
            {emailChanging ? "..." : "Change Email"}
          </button>
        </div>
        {emailMsg && <p style={{ fontSize: "0.8rem", color: emailMsg.includes("updated") ? "#4caf50" : "#cc0000", marginTop: "8px" }}>{emailMsg}</p>}

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #222" }}>
          <label style={labelStyle}>Change Password</label>
          <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "8px" }}>
            We'll send a secure link to <strong style={{ color: "#e0e0e0" }}>{member.loginEmail}</strong> where you can set a new password.
          </p>
          <button type="button" onClick={handleResetPassword} disabled={passwordSending}
            style={smallButtonStyle}>
            {passwordSending ? "Sending..." : "Send Change Password Link"}
          </button>
          {passwordMsg && <p style={{ fontSize: "0.8rem", color: passwordMsg.includes("sent") ? "#4caf50" : "#cc0000", marginTop: "8px" }}>{passwordMsg}</p>}
        </div>
      </div>
    </div>
  );
}

const coverWrapperStyle: React.CSSProperties = {
  position: "relative", borderRadius: "16px 16px 0 0", overflow: "hidden",
  height: "160px", background: "#1a1a1a",
};
const coverImageStyle: React.CSSProperties = {
  width: "100%", height: "100%", objectFit: "cover",
};
const coverPlaceholderStyle: React.CSSProperties = {
  width: "100%", height: "100%", display: "flex", alignItems: "center",
  justifyContent: "center", color: "#333", fontSize: "0.9rem",
};
const coverActionsStyle: React.CSSProperties = {
  position: "absolute", bottom: "8px", right: "8px",
  display: "flex", gap: "4px",
};
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
const photoActionsStyle: React.CSSProperties = {
  display: "flex", gap: "4px", justifyContent: "center", marginTop: "6px",
};
const photoUploadLabelStyle: React.CSSProperties = {
  fontSize: "0.7rem", color: "#ff6600", cursor: "pointer",
  padding: "2px 8px", border: "1px solid #ff6600", borderRadius: "4px",
};
const photoRemoveBtnStyle: React.CSSProperties = {
  fontSize: "0.7rem", color: "#888", cursor: "pointer",
  padding: "2px 8px", border: "1px solid #444", borderRadius: "4px",
  background: "none",
};
const headerNameStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive", fontSize: "1.5rem",
  color: "#ffcc00", letterSpacing: "1px",
};
const headerTitleStyle: React.CSSProperties = {
  fontSize: "0.85rem", color: "#ff6600", fontStyle: "italic",
};
const headerEmailStyle: React.CSSProperties = {
  fontSize: "0.8rem", color: "#888", marginTop: "4px",
};
const headerMetaStyle: React.CSSProperties = {
  fontSize: "0.7rem", color: "#555", marginTop: "2px",
};
const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive", fontSize: "1.3rem",
  color: "#ff6600", letterSpacing: "1px", marginBottom: "4px",
};
const sectionDescStyle: React.CSSProperties = {
  fontSize: "0.8rem", color: "#666", marginBottom: "16px",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.75rem", color: "#888",
  textTransform: "uppercase", letterSpacing: "1px",
  marginBottom: "4px", marginTop: "12px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#0a0a0a",
  border: "1px solid #333", borderRadius: "8px", color: "#e0e0e0",
  fontSize: "0.9rem", fontFamily: "'Inter', sans-serif",
  outline: "none", boxSizing: "border-box",
};
const gridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
};
const saveButtonStyle: React.CSSProperties = {
  padding: "12px 32px", background: "#ff6600", color: "#000",
  border: "none", borderRadius: "8px", fontFamily: "'Bangers', cursive",
  fontSize: "1rem", letterSpacing: "1px", cursor: "pointer",
};
const smallButtonStyle: React.CSSProperties = {
  padding: "10px 16px", background: "transparent", color: "#ff6600",
  border: "1px solid #ff6600", borderRadius: "8px",
  fontFamily: "'Bangers', cursive", fontSize: "0.85rem",
  letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap",
};
