"use client";
import React, { useState, useRef, useEffect } from "react";
import { multilingual } from "@wix/site";
import { i18n } from "@wix/essentials";

interface LanguageSwitcherProps {
  variant: "dropdown" | "standalone";
}

export default function LanguageSwitcher({ variant }: LanguageSwitcherProps) {
  const t = i18n.getTranslationFunction();
  const currentLanguage = i18n.getLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const languages = (() => {
    try {
      return multilingual.listSupportedLanguages();
    } catch {
      return [];
    }
  })();

  function langToFlag(regionalFormat: string | undefined): string {
    const country = regionalFormat?.split("-")[1];
    if (!country || country.length !== 2) return "";
    return String.fromCodePoint(
      ...country
        .toUpperCase()
        .split("")
        .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (languages.length < 2) return null;

  const currentLang = languages.find((l) => l.id === currentLanguage);
  const currentFlag =
    langToFlag(currentLang?.regionalFormat) || currentLanguage.toUpperCase();
  const isRtl = ["he", "ar"].includes(currentLanguage);

  if (variant === "dropdown") {
    return (
      <div
        ref={ref}
        style={styles.trigger}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <span>{t("nav.language")}</span>
        <span style={styles.currentFlag}>{currentFlag}</span>
        <span style={styles.caret}>{isRtl ? "\u25C2" : "\u25B8"}</span>
        {open && (
          <div style={isRtl ? styles.submenuRtl : styles.submenu}>
            {languages.map((lang) => (
              <a
                key={lang.id}
                href={lang.url || "#"}
                style={{
                  ...styles.option,
                  ...(lang.id === currentLanguage ? styles.optionActive : {}),
                }}
              >
                <span style={styles.flag}>
                  {langToFlag(lang.regionalFormat) ||
                    (lang.id || "").toUpperCase()}
                </span>
                <span style={styles.name}>{lang.displayName}</span>
                {lang.id === currentLanguage && (
                  <span style={styles.check}>&#10003;</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={styles.standalone}>
      <button
        type="button"
        style={styles.standaloneBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <span style={styles.standaloneFlag}>{currentFlag}</span>
        <span style={styles.standaloneCaret}>&#9662;</span>
      </button>
      {open && (
        <div style={styles.standaloneDropdown}>
          {languages.map((lang) => (
            <a
              key={lang.id}
              href={lang.url || "#"}
              style={{
                ...styles.option,
                ...(lang.id === currentLanguage ? styles.optionActive : {}),
              }}
            >
              <span style={styles.flag}>
                {langToFlag(lang.regionalFormat) ||
                  (lang.id || "").toUpperCase()}
              </span>
              <span style={styles.name}>{lang.displayName}</span>
              {lang.id === currentLanguage && (
                <span style={styles.check}>&#10003;</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    padding: "10px 16px",
    fontSize: "0.85rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    color: "#b0b0b0",
    transition: "all 0.15s",
  },
  currentFlag: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#ff6600",
    marginInlineStart: "auto",
  },
  caret: {
    fontSize: "0.55rem",
    color: "#666",
  },
  submenu: {
    position: "absolute",
    left: "100%",
    top: -6,
    background: "rgba(20, 20, 20, 0.98)",
    border: "1px solid #333",
    borderRadius: 8,
    minWidth: 150,
    padding: "6px 0",
    zIndex: 210,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
  },
  submenuRtl: {
    position: "absolute",
    right: "100%",
    top: -6,
    background: "rgba(20, 20, 20, 0.98)",
    border: "1px solid #333",
    borderRadius: 8,
    minWidth: 150,
    padding: "6px 0",
    zIndex: 210,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
  },
  standalone: {
    position: "relative",
  },
  standaloneBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 10px",
    background: "none",
    border: "1px solid #333",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  standaloneFlag: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#ff6600",
  },
  standaloneCaret: {
    fontSize: "0.5rem",
    color: "#666",
  },
  standaloneDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "rgba(20, 20, 20, 0.98)",
    border: "1px solid #333",
    borderRadius: 8,
    minWidth: 150,
    padding: "6px 0",
    zIndex: 200,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    fontSize: "0.8rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    color: "#b0b0b0",
    textDecoration: "none",
    transition: "all 0.15s",
  },
  optionActive: {
    color: "#ffcc00",
  },
  flag: {
    fontSize: "1.2rem",
    fontWeight: 700,
    minWidth: 24,
  },
  name: {
    flex: 1,
  },
  check: {
    fontSize: "0.7rem",
    color: "#ff6600",
  },
};
