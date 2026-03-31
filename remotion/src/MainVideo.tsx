import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Img, Sequence } from "remotion";
import { staticFile } from "remotion";

export const MainVideo = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slow zoom into the interaction point between the two characters
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.35], {
    extrapolateRight: "clamp",
  });

  // Gentle pan — start wider, drift toward the blue character's hand gesture area
  const translateX = interpolate(frame, [0, durationInFrames], [0, -60], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, durationInFrames], [0, -80], {
    extrapolateRight: "clamp",
  });

  // Subtle breathing glow overlay
  const glowOpacity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.0, 0.15]
  );

  // Energy pulse from blue character — periodic bursts
  const pulsePhase = (frame % 45) / 45;
  const pulseScale = interpolate(pulsePhase, [0, 0.3, 1], [0.5, 1.2, 0.5], {
    extrapolateRight: "clamp",
  });
  const pulseOpacity = interpolate(pulsePhase, [0, 0.2, 0.6, 1], [0, 0.6, 0.3, 0], {
    extrapolateRight: "clamp",
  });

  // Second pulse offset
  const pulse2Phase = ((frame + 22) % 60) / 60;
  const pulse2Opacity = interpolate(pulse2Phase, [0, 0.2, 0.6, 1], [0, 0.4, 0.2, 0], {
    extrapolateRight: "clamp",
  });

  // Floating particles effect — subtle sparkles
  const particles = Array.from({ length: 12 }, (_, i) => {
    const seed = i * 137.5;
    const x = (seed % 100);
    const baseY = ((seed * 2.3) % 100);
    const drift = Math.sin(frame * 0.03 + i) * 3;
    const floatY = interpolate(
      (frame + i * 20) % 120,
      [0, 120],
      [baseY, baseY - 15]
    );
    const particleOpacity = interpolate(
      Math.sin(frame * 0.05 + i * 1.2),
      [-1, 1],
      [0, 0.7]
    );
    return { x: x + drift, y: floatY % 100, opacity: particleOpacity, size: 2 + (i % 3) };
  });

  // Vignette fade in
  const vignetteOpacity = interpolate(frame, [0, 30], [0.8, 0.4], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Main image with Ken Burns */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "55% 35%",
        }}
      >
        <Img
          src={staticFile("images/character.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>

      {/* Blue energy glow overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 40% 30% at 55% 25%, rgba(80, 160, 255, ${glowOpacity}), transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* Orange energy glow — degen character */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 30% 25% at 35% 70%, rgba(255, 160, 40, ${glowOpacity * 0.7}), transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* Energy pulse from blue character's hand */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          width: 120,
          height: 120,
          marginLeft: -60,
          marginTop: -60,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(100, 180, 255, ${pulseOpacity}), transparent 70%)`,
          transform: `scale(${pulseScale})`,
          mixBlendMode: "screen",
        }}
      />

      {/* Second pulse — connection point */}
      <div
        style={{
          position: "absolute",
          left: "45%",
          top: "45%",
          width: 80,
          height: 80,
          marginLeft: -40,
          marginTop: -40,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255, 200, 80, ${pulse2Opacity}), transparent 70%)`,
          transform: `scale(${pulseScale * 0.8})`,
          mixBlendMode: "screen",
        }}
      />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: i % 2 === 0 ? "rgba(100, 180, 255, 0.8)" : "rgba(255, 180, 60, 0.8)",
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 3}px ${i % 2 === 0 ? "rgba(100, 180, 255, 0.5)" : "rgba(255, 180, 60, 0.5)"}`,
          }}
        />
      ))}

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
