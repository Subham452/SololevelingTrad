import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import bgImage from "../assets/background.jpeg";
import bgVideo from "../assets/background_video.mp4"

export default function AtmosphericBackground({ image = bgImage, video = bgVideo }) {
  const mediaRef = useRef(null);
  const [videoDead, setVideoDead] = useState(false);
  const showVideo = video && !videoDead;

  useEffect(() => {
    if (showVideo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = mediaRef.current;
    if (!el) return;
    const tween = gsap.fromTo(
      el,
      { scale: 1.02, xPercent: 0, yPercent: 0 },
      { scale: 1.1, xPercent: -1.5, yPercent: 1.5, duration: 26, ease: "sine.inOut", yoyo: true, repeat: -1 }
    );
    return () => tween.kill();
  }, [showVideo, image]);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-black" aria-hidden="true">
      {showVideo ? (
        <video autoPlay muted loop playsInline preload="metadata" poster={image} src={video} onError={() => setVideoDead(true)} className="h-full w-full object-cover rotate-[0deg]" />
      ) : (
        <img ref={mediaRef} src={image} alt="" className="h-full w-full object-cover" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/55" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(59,130,246,0.18),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")` }}
      />
    </div>
  );
}
