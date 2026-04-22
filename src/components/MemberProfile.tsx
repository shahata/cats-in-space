'use client';
import React, { useState } from 'react';
import { members, authentication, membersAbout } from '@wix/members';
import type { members as membersTypes } from '@wix/members';
import { getData as getCountries } from 'country-list';
import { createClient, OAuthStrategy } from '@wix/sdk';
import { authentication as identityAuth } from '@wix/identity';
import { i18n } from '@wix/essentials';

function toE164(phone: string): string {
	// Strip everything except digits and leading +
	const cleaned = phone.replace(/[^\d+]/g, '');
	if (cleaned.startsWith('+')) return cleaned;
	// If it's 10 digits, assume US and prepend +1
	if (cleaned.length === 10) return `+1${cleaned}`;
	// Otherwise prepend +
	return `+${cleaned}`;
}

interface Props {
	member: membersTypes.Member;
	aboutData: { id: string | null; revision: string | null; text: string };
	tab?: 'profile' | 'personal' | 'account';
}

export default function MemberProfile({ member, aboutData, tab = 'profile' }: Props) {
	const t = i18n.getTranslationFunction();
	// Public profile
	const [nickname, setNickname] = useState(member.profile?.nickname || '');
	const [title, setTitle] = useState(member.profile?.title || '');
	const [slug, setSlug] = useState(member.profile?.slug || '');
	const [privacyStatus, setPrivacyStatus] = useState<string>(member.privacyStatus || 'PUBLIC');

	// Contact info
	const [firstName, setFirstName] = useState(member.contact?.firstName || '');
	const [lastName, setLastName] = useState(member.contact?.lastName || '');
	const [company, setCompany] = useState(member.contact?.company || '');
	const [jobTitle, setJobTitle] = useState(member.contact?.jobTitle || '');
	const [birthdate, setBirthdate] = useState(member.contact?.birthdate || '');
	const [phone, setPhone] = useState(member.contact?.phones?.[0] || '');

	// Address
	const addr = member.contact?.addresses?.[0] || {};
	const [addressLine, setAddressLine] = useState(addr.addressLine || '');
	const [addressLine2, setAddressLine2] = useState(addr.addressLine2 || '');
	const [city, setCity] = useState(addr.city || '');
	const [subdivision, setSubdivision] = useState(addr.subdivision || '');
	const [country, setCountry] = useState(addr.country || '');
	const [postalCode, setPostalCode] = useState(addr.postalCode || '');

	// Credentials
	const [newEmail, setNewEmail] = useState('');
	const [emailChanging, setEmailChanging] = useState(false);
	const [emailMsg, setEmailMsg] = useState('');
	const [passwordMsg, setPasswordMsg] = useState('');
	const [passwordSending, setPasswordSending] = useState(false);
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [passwordChanging, setPasswordChanging] = useState(false);

	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [slugSaving, setSlugSaving] = useState(false);
	const [photoUploading, setPhotoUploading] = useState(false);

	const [photo, setPhoto] = useState<string | undefined>(member.profile?.photo?.url);
	const [, setPhotoId] = useState<string | undefined>(member.profile?.photo?._id);
	const [, setRemovePhoto] = useState(false);
	const [cover, setCover] = useState<string | undefined>(member.profile?.cover?.url);
	const [coverUploading, setCoverUploading] = useState(false);
	const [about, setAbout] = useState(aboutData.text);
	const [aboutId, setAboutId] = useState<string | null>(aboutData.id);
	const [aboutRevision, setAboutRevision] = useState<string | null>(aboutData.revision);
	const [aboutSaving, setAboutSaving] = useState(false);
	const [aboutSaved, setAboutSaved] = useState(false);

	async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setPhotoUploading(true);
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('memberId', member._id!);

			const res = await fetch('/api/profile-photo', {
				method: 'POST',
				body: formData,
			});

			const data = await res.json();
			if (res.ok && data.id && data.url) {
				setPhotoId(data.id);
				setPhoto(data.url);
				setRemovePhoto(false);
			} else {
				alert(data.error || t('profile.failedUpload'));
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : t('profile.failedUpload'));
		}
		setPhotoUploading(false);
	}

	async function handleRemovePhoto() {
		setPhoto(undefined);
		setPhotoId(undefined);
		setRemovePhoto(true);
		try {
			const res = await fetch('/api/profile-photo', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ memberId: member._id! }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				alert(data.error || t('profile.failedRemovePhoto'));
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : t('profile.failedRemovePhoto'));
		}
	}

	async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setCoverUploading(true);
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('memberId', member._id!);
			formData.append('field', 'cover');
			const res = await fetch('/api/profile-photo', { method: 'POST', body: formData });
			const data = await res.json();
			if (res.ok && data.url) {
				setCover(data.url);
			} else {
				alert(data.error || t('profile.failedUploadCover'));
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : t('profile.failedUploadCover'));
		}
		setCoverUploading(false);
	}

	async function handleRemoveCover() {
		setCover(undefined);
		try {
			const res = await fetch('/api/profile-photo', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ memberId: member._id!, field: 'cover' }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				alert(data.error || t('profile.failedRemoveCover'));
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : t('profile.failedRemoveCover'));
		}
	}

	function makeAboutContent(text: string) {
		return {
			nodes: text
				.split('\n')
				.filter(Boolean)
				.map((line) => ({
					type: 'PARAGRAPH' as const,
					nodes: [{ type: 'TEXT' as const, textData: { text: line, decorations: [] } }],
					paragraphData: {},
				})),
		};
	}

	async function handleSaveAbout() {
		setAboutSaving(true);
		try {
			const content = makeAboutContent(about);
			if (!about.trim()) {
				setAboutSaving(false);
				return;
			}
			if (aboutId && aboutRevision) {
				const res = await membersAbout.updateMemberAbout(aboutId, { content, revision: aboutRevision });
				setAboutRevision(res.revision || aboutRevision);
				setAboutSaved(true);
			} else {
				// memberId is required at runtime but missing from the SDK type definition
				const res = await (membersAbout.createMemberAbout as Function)({ memberId: member._id!, content });
				setAboutId(res._id || null);
				setAboutRevision(res.revision || null);
				setAboutSaved(true);
			}
			setTimeout(() => setAboutSaved(false), 3000);
		} catch (e) {
			alert(e instanceof Error ? e.message : t('profile.failedSaveAbout'));
		}
		setAboutSaving(false);
	}

	async function handleChangeEmail() {
		if (!newEmail.trim()) return;
		setEmailChanging(true);
		setEmailMsg('');
		try {
			// Must be called as the member (not elevated) — requires Member identity
			await authentication.changeLoginEmail(member._id!, newEmail.trim());
			setEmailMsg(t('profile.emailUpdated'));
			setNewEmail('');
		} catch (e) {
			setEmailMsg(e instanceof Error ? e.message : t('profile.failedChangeEmail'));
		}
		setEmailChanging(false);
	}

	async function handleResetPassword() {
		setPasswordSending(true);
		setPasswordMsg('');
		try {
			await authentication.sendSetPasswordEmail(member.loginEmail!);
			setPasswordMsg(t('profile.passwordResetSent'));
		} catch (e) {
			setPasswordMsg(e instanceof Error ? e.message : t('profile.failedResetPassword'));
		}
		setPasswordSending(false);
	}

	async function handleChangePassword() {
		if (!currentPassword.trim() || !newPassword.trim()) return;
		if (newPassword !== confirmPassword) {
			setPasswordMsg(t('profile.passwordsDoNotMatch'));
			return;
		}
		setPasswordChanging(true);
		setPasswordMsg('');
		try {
			const wixClient = createClient({
				modules: { authentication: identityAuth },
				auth: OAuthStrategy({ clientId: '2168e967-8e53-4561-b535-3fe367938245' }),
			});

			// Verify current password and get session token
			const loginResponse = await wixClient.authentication.loginV2(
				{ email: member.loginEmail! },
				{ password: currentPassword },
			);
			if (!loginResponse.sessionToken) {
				setPasswordMsg(t('profile.failedChangePassword'));
				setPasswordChanging(false);
				return;
			}

			// Authenticate client with the member's session
			const tokens = await wixClient.auth.getMemberTokensForDirectLogin(loginResponse.sessionToken);
			wixClient.auth.setTokens(tokens);

			// Change password
			await wixClient.authentication.changePassword(newPassword);

			setPasswordMsg(t('profile.passwordChanged'));
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (e) {
			const msg = e instanceof Error ? e.message : '';
			if (
				msg.toLowerCase().includes('password') ||
				msg.toLowerCase().includes('invalid') ||
				msg.toLowerCase().includes('credentials')
			) {
				setPasswordMsg(t('profile.incorrectPassword'));
			} else {
				setPasswordMsg(msg || t('profile.failedChangePassword'));
			}
		}
		setPasswordChanging(false);
	}

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setSaved(false);
		try {
			const profileUpdate: membersTypes.Profile = {};
			if (nickname) profileUpdate.nickname = nickname;
			if (title) profileUpdate.title = title;

			await members.updateMember(member._id!, {
				profile: profileUpdate,
				contact: {
					firstName: firstName || null,
					lastName: lastName || null,
					company: company || null,
					jobTitle: jobTitle || null,
					birthdate: birthdate || null,
					phones: phone ? [toE164(phone)] : [],
					addresses: [
						{
							...(addr._id ? { _id: addr._id } : {}),
							addressLine: addressLine || null,
							addressLine2: addressLine2 || null,
							city: city || null,
							subdivision: subdivision || null,
							country: country || null,
							postalCode: postalCode || null,
						},
					],
				},
			});

			// Privacy is controlled via joinCommunity/leaveCommunity, not updateMember
			const currentPrivacy = member.privacyStatus || 'PUBLIC';
			if (privacyStatus !== currentPrivacy) {
				if (privacyStatus === 'PUBLIC') {
					await members.joinCommunity();
				} else {
					await members.leaveCommunity();
				}
			}
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch (e) {
			alert(e instanceof Error ? e.message : t('profile.failedUpdateProfile'));
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
		} catch (e) {
			alert(e instanceof Error ? e.message : t('profile.failedUpdateSlug'));
		}
		setSlugSaving(false);
	}

	return (
		<div>
			{tab === 'profile' && (
				<>
					{/* Cover photo */}
					<div style={coverWrapperStyle}>
						{cover ? (
							<img src={cover} alt="Cover" style={coverImageStyle} referrerPolicy="no-referrer" />
						) : (
							<div style={coverPlaceholderStyle}>{t('profile.noCoverPhoto')}</div>
						)}
						<div style={coverActionsStyle}>
							<label style={photoUploadLabelStyle}>
								{coverUploading ? '...' : t('profile.changeCover')}
								<input
									type="file"
									accept="image/*"
									onChange={handleCoverUpload}
									style={{ display: 'none' }}
									disabled={coverUploading}
								/>
							</label>
							{cover && (
								<button type="button" onClick={handleRemoveCover} style={photoRemoveBtnStyle}>
									{t('profile.remove')}
								</button>
							)}
						</div>
					</div>

					{/* Profile header */}
					<div style={{ ...headerStyle, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: '-1px' }}>
						<div style={{ position: 'relative' }}>
							{photo ? (
								<img src={photo} alt={nickname} style={photoStyle} referrerPolicy="no-referrer" />
							) : (
								<div style={photoPlaceholderStyle}>?</div>
							)}
							<div style={photoActionsStyle}>
								<label style={photoUploadLabelStyle}>
									{photoUploading ? '...' : t('profile.change')}
									<input
										type="file"
										accept="image/*"
										onChange={handlePhotoUpload}
										style={{ display: 'none' }}
										disabled={photoUploading}
									/>
								</label>
								{photo && (
									<button type="button" onClick={handleRemovePhoto} style={photoRemoveBtnStyle}>
										{t('profile.remove')}
									</button>
								)}
							</div>
						</div>
						<div>
							<div style={headerNameStyle}>{nickname || firstName || t('profile.unnamedCat')}</div>
							{title && <div style={headerTitleStyle}>{title}</div>}
							<div style={headerEmailStyle}>{member.loginEmail}</div>
							<div style={headerMetaStyle}>
								{t('profile.memberSince')}{' '}
								{member._createdDate ? new Date(member._createdDate).toLocaleDateString() : 'unknown'}
								{member.lastLoginDate && (
									<>
										{' '}
										&middot; {t('profile.lastLogin')} {new Date(member.lastLoginDate).toLocaleDateString()}
									</>
								)}
							</div>
						</div>
					</div>

					<form onSubmit={handleSave}>
						<h3 style={sectionHeadingStyle}>{t('profile.publicProfile')}</h3>
						<p style={sectionDescStyle}>{t('profile.publicProfileDesc')}</p>

						<label style={labelStyle}>{t('profile.nickname')}</label>
						<input
							type="text"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							placeholder={t('profile.nicknamePlaceholder')}
							style={inputStyle}
						/>

						<label style={labelStyle}>{t('profile.title')}</label>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={t('profile.titlePlaceholder')}
							style={inputStyle}
						/>

						<label style={labelStyle}>{t('profile.profileSlug')}</label>
						<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
							<input
								type="text"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								placeholder={t('profile.slugPlaceholder')}
								style={{ ...inputStyle, flex: 1 }}
							/>
							<button
								type="button"
								onClick={handleSlugUpdate}
								disabled={slugSaving}
								style={{ ...smallButtonStyle, marginTop: 0 }}
							>
								{slugSaving ? '...' : t('profile.update')}
							</button>
						</div>

						<label style={labelStyle}>{t('profile.privacy')}</label>
						<select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value)} style={inputStyle}>
							<option value="PUBLIC">{t('profile.privacyPublic')}</option>
							<option value="PRIVATE">{t('profile.privacyPrivate')}</option>
						</select>

						<h3 style={{ ...sectionHeadingStyle, marginTop: '40px' }}>{t('profile.about')}</h3>
						<p style={sectionDescStyle}>{t('profile.aboutDesc')}</p>
						<textarea
							value={about}
							onChange={(e) => setAbout(e.target.value)}
							placeholder={t('profile.aboutPlaceholder')}
							rows={4}
							style={{ ...inputStyle, resize: 'vertical' as const }}
						/>
						<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
							<button type="button" onClick={handleSaveAbout} disabled={aboutSaving} style={smallButtonStyle}>
								{aboutSaving ? t('profile.saving') : t('profile.saveAbout')}
							</button>
							{aboutSaved && <span style={{ color: '#4caf50', fontSize: '0.8rem' }}>{t('profile.saved')}</span>}
						</div>

						<div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
							<button type="submit" disabled={saving} style={saveButtonStyle}>
								{saving ? t('profile.saving') : t('profile.saveChanges')}
							</button>
							{saved && <span style={{ color: '#4caf50', fontSize: '0.9rem' }}>{t('profile.profileUpdated')}</span>}
						</div>
					</form>
				</>
			)}

			{tab === 'personal' && (
				<form onSubmit={handleSave}>
					<h3 style={sectionHeadingStyle}>{t('profile.personalInfo')}</h3>
					<p style={sectionDescStyle}>{t('profile.personalInfoDesc')}</p>

					<div style={gridStyle}>
						<div>
							<label style={labelStyle}>{t('profile.firstName')}</label>
							<input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
						</div>
						<div>
							<label style={labelStyle}>{t('profile.lastName')}</label>
							<input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
						</div>
					</div>

					<div style={gridStyle}>
						<div>
							<label style={labelStyle}>{t('profile.company')}</label>
							<input type="text" value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
						</div>
						<div>
							<label style={labelStyle}>{t('profile.jobTitle')}</label>
							<input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={inputStyle} />
						</div>
					</div>

					<div style={gridStyle}>
						<div>
							<label style={labelStyle}>{t('profile.phone')}</label>
							<input
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder={t('profile.phonePlaceholder')}
								style={inputStyle}
							/>
						</div>
						<div>
							<label style={labelStyle}>{t('profile.birthdate')}</label>
							<input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} style={inputStyle} />
						</div>
					</div>

					<h3 style={{ ...sectionHeadingStyle, marginTop: '40px' }}>{t('profile.address')}</h3>
					<p style={sectionDescStyle}>{t('profile.addressDesc')}</p>

					<label style={labelStyle}>{t('profile.addressLine1')}</label>
					<input
						type="text"
						value={addressLine}
						onChange={(e) => setAddressLine(e.target.value)}
						placeholder={t('profile.addressLine1Placeholder')}
						style={inputStyle}
					/>

					<label style={labelStyle}>{t('profile.addressLine2')}</label>
					<input
						type="text"
						value={addressLine2}
						onChange={(e) => setAddressLine2(e.target.value)}
						placeholder={t('profile.addressLine2Placeholder')}
						style={inputStyle}
					/>

					<div style={gridStyle}>
						<div>
							<label style={labelStyle}>{t('profile.city')}</label>
							<input type="text" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
						</div>
						<div>
							<label style={labelStyle}>{t('profile.postalCode')}</label>
							<input
								type="text"
								value={postalCode}
								onChange={(e) => setPostalCode(e.target.value)}
								style={inputStyle}
							/>
						</div>
					</div>

					<div style={gridStyle}>
						<div>
							<label style={labelStyle}>{t('profile.country')}</label>
							<select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
								<option value="">{t('profile.selectCountry')}</option>
								{getCountries().map((c) => (
									<option key={c.code} value={c.code}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label style={labelStyle}>{t('profile.stateProvince')}</label>
							<input
								type="text"
								value={subdivision}
								onChange={(e) => setSubdivision(e.target.value)}
								style={inputStyle}
							/>
						</div>
					</div>

					<div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
						<button type="submit" disabled={saving} style={saveButtonStyle}>
							{saving ? t('profile.saving') : t('profile.saveChanges')}
						</button>
						{saved && <span style={{ color: '#4caf50', fontSize: '0.9rem' }}>{t('profile.profileUpdated')}</span>}
					</div>
				</form>
			)}

			{tab === 'account' && (
				<>
					<h3 style={sectionHeadingStyle}>{t('profile.loginCredentials')}</h3>
					<p style={sectionDescStyle}>{t('profile.loginCredentialsDesc')}</p>

					<div style={{ background: '#141414', border: '1px solid #222', borderRadius: '12px', padding: '24px' }}>
						<label style={labelStyle}>{t('profile.currentLoginEmail')}</label>
						<p style={{ color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '16px' }}>{member.loginEmail}</p>

						<label style={labelStyle}>{t('profile.newLoginEmail')}</label>
						<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
							<input
								type="email"
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								placeholder={t('profile.newEmailPlaceholder')}
								style={{ ...inputStyle, flex: 1 }}
							/>
							<button type="button" onClick={handleChangeEmail} disabled={emailChanging} style={smallButtonStyle}>
								{emailChanging ? '...' : t('profile.changeEmail')}
							</button>
						</div>
						{emailMsg && (
							<p
								style={{
									fontSize: '0.8rem',
									color:
										emailMsg.includes('updated') || emailMsg.includes(t('profile.emailUpdated').substring(0, 5))
											? '#4caf50'
											: '#cc0000',
									marginTop: '8px',
								}}
							>
								{emailMsg}
							</p>
						)}

						<div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #222' }}>
							<label style={labelStyle}>{t('profile.changePassword')}</label>

							<div style={{ marginBottom: '16px' }}>
								<label style={{ ...labelStyle, fontSize: '0.8rem', color: '#aaa' }}>
									{t('profile.currentPassword')}
								</label>
								<input
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									placeholder={t('profile.currentPasswordPlaceholder')}
									style={{ ...inputStyle, marginBottom: '8px' }}
								/>
								<label style={{ ...labelStyle, fontSize: '0.8rem', color: '#aaa' }}>{t('profile.newPassword')}</label>
								<input
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									placeholder={t('profile.newPasswordPlaceholder')}
									style={{ ...inputStyle, marginBottom: '8px' }}
								/>
								<label style={{ ...labelStyle, fontSize: '0.8rem', color: '#aaa' }}>
									{t('profile.confirmPassword')}
								</label>
								<input
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder={t('profile.confirmPasswordPlaceholder')}
									style={{ ...inputStyle, marginBottom: '8px' }}
								/>
								<button
									type="button"
									onClick={handleChangePassword}
									disabled={passwordChanging || !currentPassword.trim() || !newPassword.trim()}
									style={smallButtonStyle}
								>
									{passwordChanging ? t('profile.sending') : t('profile.changePasswordButton')}
								</button>
							</div>

							<div style={{ paddingTop: '12px', borderTop: '1px solid #222' }}>
								<p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '8px' }}>
									{t('profile.changePasswordDesc', { email: member.loginEmail || '' })}
								</p>
								<button type="button" onClick={handleResetPassword} disabled={passwordSending} style={smallButtonStyle}>
									{passwordSending ? t('profile.sending') : t('profile.sendChangePasswordLink')}
								</button>
							</div>

							{passwordMsg && (
								<p
									style={{
										fontSize: '0.8rem',
										color:
											passwordMsg.includes('sent') ||
											passwordMsg.includes(t('profile.passwordChanged')?.substring(0, 5)) ||
											passwordMsg.includes(t('profile.passwordResetSent').substring(0, 5))
												? '#4caf50'
												: '#cc0000',
										marginTop: '8px',
									}}
								>
									{passwordMsg}
								</p>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

const coverWrapperStyle: React.CSSProperties = {
	position: 'relative',
	borderRadius: '16px 16px 0 0',
	overflow: 'hidden',
	height: '160px',
	background: '#1a1a1a',
};
const coverImageStyle: React.CSSProperties = {
	width: '100%',
	height: '100%',
	objectFit: 'cover',
};
const coverPlaceholderStyle: React.CSSProperties = {
	width: '100%',
	height: '100%',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	color: '#333',
	fontSize: '0.9rem',
};
const coverActionsStyle: React.CSSProperties = {
	position: 'absolute',
	bottom: '8px',
	right: '8px',
	display: 'flex',
	gap: '4px',
};
const headerStyle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: '20px',
	padding: '24px',
	background: '#141414',
	border: '1px solid #222',
	borderRadius: '16px',
	marginBottom: '32px',
};
const photoStyle: React.CSSProperties = {
	width: '80px',
	height: '80px',
	borderRadius: '50%',
	objectFit: 'cover',
	border: '3px solid #ff6600',
};
const photoPlaceholderStyle: React.CSSProperties = {
	width: '80px',
	height: '80px',
	borderRadius: '50%',
	background: '#1a1a1a',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	fontFamily: "'Black Ops One', cursive",
	fontSize: '2rem',
	color: '#444',
	border: '3px solid #333',
};
const photoActionsStyle: React.CSSProperties = {
	display: 'flex',
	gap: '4px',
	justifyContent: 'center',
	marginTop: '6px',
};
const photoUploadLabelStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	color: '#ff6600',
	cursor: 'pointer',
	padding: '2px 8px',
	border: '1px solid #ff6600',
	borderRadius: '4px',
};
const photoRemoveBtnStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	color: '#888',
	cursor: 'pointer',
	padding: '2px 8px',
	border: '1px solid #444',
	borderRadius: '4px',
	background: 'none',
};
const headerNameStyle: React.CSSProperties = {
	fontFamily: "'Bangers', cursive",
	fontSize: '1.5rem',
	color: '#ffcc00',
	letterSpacing: '1px',
};
const headerTitleStyle: React.CSSProperties = {
	fontSize: '0.85rem',
	color: '#ff6600',
	fontStyle: 'italic',
};
const headerEmailStyle: React.CSSProperties = {
	fontSize: '0.8rem',
	color: '#888',
	marginTop: '4px',
};
const headerMetaStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	color: '#555',
	marginTop: '2px',
};
const sectionHeadingStyle: React.CSSProperties = {
	fontFamily: "'Bangers', cursive",
	fontSize: '1.3rem',
	color: '#ff6600',
	letterSpacing: '1px',
	marginBottom: '4px',
};
const sectionDescStyle: React.CSSProperties = {
	fontSize: '0.8rem',
	color: '#666',
	marginBottom: '16px',
};
const labelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: '0.75rem',
	color: '#888',
	textTransform: 'uppercase',
	letterSpacing: '1px',
	marginBottom: '4px',
	marginTop: '12px',
};
const inputStyle: React.CSSProperties = {
	width: '100%',
	padding: '10px 14px',
	background: '#0a0a0a',
	border: '1px solid #333',
	borderRadius: '8px',
	color: '#e0e0e0',
	fontSize: '0.9rem',
	fontFamily: "'Inter', sans-serif",
	outline: 'none',
	boxSizing: 'border-box',
};
const gridStyle: React.CSSProperties = {
	display: 'grid',
	gridTemplateColumns: '1fr 1fr',
	gap: '12px',
};
const saveButtonStyle: React.CSSProperties = {
	padding: '12px 32px',
	background: '#ff6600',
	color: '#000',
	border: 'none',
	borderRadius: '8px',
	fontFamily: "'Bangers', cursive",
	fontSize: '1rem',
	letterSpacing: '1px',
	cursor: 'pointer',
};
const smallButtonStyle: React.CSSProperties = {
	padding: '10px 16px',
	background: 'transparent',
	color: '#ff6600',
	border: '1px solid #ff6600',
	borderRadius: '8px',
	fontFamily: "'Bangers', cursive",
	fontSize: '0.85rem',
	letterSpacing: '1px',
	cursor: 'pointer',
	whiteSpace: 'nowrap',
};
