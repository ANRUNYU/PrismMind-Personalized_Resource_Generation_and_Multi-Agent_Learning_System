import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export default function TopNav() {
  const [userOpen, setUserOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        navRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.72, ease: "power3.out" }
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
    clearStudentAuthStorage();
    window.location.assign("/auth/login");
  };

  return (
    <header className="top-nav" ref={navRef}>
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
            <span>学习画像</span>
            <small>棱镜智教-PrismMind</small>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function clearStudentAuthStorage() {
  const explicitKeys = [
    "access_token",
    "refresh_token",
    "edugenie_access_token",
    "edugenie_refresh_token",
    "edugenie_user_info"
  ];

  explicitKeys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  [localStorage, sessionStorage].forEach((storage) => {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith("prismmind_") || key?.startsWith("edugenie_")) {
        storage.removeItem(key);
      }
    }
  });
}
