import { useLocation } from "react-router";
import { useEffect } from "react";

const stars = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  size: Math.random() * 2 + 1,
  duration: `${Math.random() * 4 + 2}s`,
  delay: `${Math.random() * 4}s`,
}));

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
      {/* Starfield */}
      {stars.map((star) => (
        <span
          key={star.id}
          className="star absolute rounded-full bg-foreground/70 pointer-events-none"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDuration: star.duration,
            animationDelay: star.delay,
          }}
        />
      ))}

      {/* Shooting Stars */}
      <div
        className="shooting-star"
        style={{ top: "20%", left: "80%", animationDelay: "0s" }}
      />
      <div
        className="shooting-star delay-slow"
        style={{ top: "50%", left: "60%", animationDelay: "4s" }}
      />
      <div
        className="shooting-star delay-v-slow"
        style={{ top: "70%", left: "90%", animationDelay: "7s" }}
      />

      {/* Ambient glow blob */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 480,
          height: 480,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, hsl(217 91% 60% / 0.07) 0%, transparent 70%)",
        }}
      />

      {/* Card */}
      <div className="glass-card glow-effect relative z-10 flex flex-col items-center gap-6 rounded-2xl px-12 py-14 text-center max-w-md w-full mx-4">
        {/* 404 Glowing Number */}
        <div className="relative select-none">
          <span
            className="text-[7rem] font-extrabold leading-none tracking-tighter text-gradient animate-glow"
            aria-hidden="true"
          >
            404
          </span>
          {/* Ghost echo for depth */}
          <span
            className="absolute inset-0 text-[7rem] font-extrabold leading-none tracking-tighter text-primary/10 blur-sm select-none"
            aria-hidden="true"
          >
            404
          </span>
        </div>

        {/* Divider */}
        <div className="h-px w-16 rounded-full bg-border" />

        {/* Message */}
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-foreground">Page Not Found</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The route{" "}
            <code className="status-badge status-pending font-mono text-[11px]">
              {location.pathname}
            </code>{" "}
            does not exist in this system.
          </p>
        </div>

        {/* CTA */}
        <a
          href="/"
          className="nav-item active mt-2 px-6 py-2.5 rounded-lg font-semibold text-sm text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-all duration-200"
        >
          ← Return to Dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
