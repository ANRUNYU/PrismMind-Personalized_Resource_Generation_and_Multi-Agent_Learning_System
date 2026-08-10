import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import PrismMindLogo from "../Brand/PrismMindLogo.jsx";
import "./StudentTopNav.css";

export default function StudentTopNav({
  userLabel = "Learning path",
  userDescription = "PrismMind student workspace"
}) {
  const [userOpen, setUserOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        navRef.current,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.72, ease: "power3.out" }
      );
    }, navRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!navRef.current?.contains(event.target)) {
        setUserOpen(false);
      }
    };

    window.addEventListener("click", handleDocumentClick);
    return () => window.removeEventListener("click", handleDocumentClick);
  }, []);

  const handleHome = () => {
    window.location.assign("/student/dashboard");
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleUser = () => {
    setUserOpen((current) => !current);
  };

  const handleLogout = () => {
    localStorage.removeItem("edugenie_access_token");
    localStorage.removeItem("edugenie_refresh_token");
    localStorage.removeItem("edugenie_user");
    window.location.assign("/auth/login");
  };

  return (
    <header className="top-nav" ref={navRef}>
      <button
        className="top-brand"
        type="button"
        aria-label="棱镜智教-PrismMind 首页"
        onClick={handleHome}
      >
        <PrismMindLogo />
        <span className="top-brand-name">
          <strong>棱镜智教</strong>
          <em>PrismMind</em>
        </span>
      </button>

      <div className="top-nav-left">
        <button className="top-nav-button is-active" type="button" onClick={handleHome}>
          首页
        </button>
        <button className="top-nav-button" type="button" onClick={handleBack}>
          返回
        </button>
      </div>

      <div className="top-nav-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="top-nav-right">
        <button className="top-nav-button" type="button" onClick={handleUser}>
          用户
        </button>
        <button className="top-nav-button" type="button" onClick={handleLogout}>
          退出
        </button>
        {userOpen ? (
          <div className="top-user-popover">
            <span>{userLabel}</span>
            <small>{userDescription}</small>
          </div>
        ) : null}
      </div>
    </header>
  );
}
