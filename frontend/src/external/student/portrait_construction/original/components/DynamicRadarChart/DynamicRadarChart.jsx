import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  createRadarPolling,
  EMPTY_RADAR_DATA,
  normalizeRadarData,
  RADAR_API_PATH
  , profileToRadarData
} from "./radarApi.js";
import ChatPanel from "../ChatPanel/ChatPanel.jsx";

const VIEW_BOX = "-300 -300 600 600";
const MAX_RADIUS = 214;
const START_ANGLE = -90;
const ANGLE_SIZE = 60;
const AXIS_COUNT = 6;
const VALUE_RINGS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const SCALE_LABELS = [10, 30, 50, 70, 90, 100];
const RING_CONFIGS = [
  { value: 10, className: "ring-inner ring-solid", speed: 46, direction: 1, full: true },
  { value: 20, className: "ring-inner ring-dotted", speed: 58, direction: -1, full: true, dash: "1 8", dots: true },
  { value: 30, className: "ring-minor ring-dashed", speed: 66, direction: 1, arcs: [[-166, -34], [24, 136], [188, 276]], dash: "4 12", ticks: true },
  { value: 40, className: "ring-faint ring-solid", speed: 74, direction: -1, full: true },
  { value: 50, className: "ring-major ring-dashed", speed: 82, direction: 1, arcs: [[-132, 52], [88, 162], [208, 312]], dash: "10 18", segments: true },
  { value: 60, className: "ring-faint ring-solid", speed: 92, direction: -1, arcs: [[-72, 112], [156, 250]] },
  { value: 70, className: "ring-minor ring-dashed", speed: 104, direction: 1, arcs: [[-176, -82], [-22, 124], [178, 286]], dash: "3 16", ticks: true },
  { value: 80, className: "ring-structure ring-solid", speed: 116, direction: -1, full: true, segments: true },
  { value: 90, className: "ring-major ring-dashed", speed: 130, direction: 1, arcs: [[-154, 38], [72, 156], [188, 326]], dash: "13 22", ticks: true, dots: true }
];
const COMPOSITION_ARCS = [
  { radius: 238, start: -48, end: 82, className: "composition-arc composition-arc-heavy" },
  { radius: 254, start: 18, end: 142, className: "composition-arc composition-arc-soft" },
  { radius: 226, start: 118, end: 236, className: "composition-arc composition-arc-dust" },
  { radius: 270, start: -178, end: -104, className: "composition-arc composition-arc-thin" },
  { radius: 176, start: 28, end: 94, className: "composition-arc composition-arc-inner" },
  { radius: 204, start: -128, end: -54, className: "composition-arc composition-arc-left-density" },
  { radius: 282, start: 54, end: 108, className: "composition-arc composition-arc-edge" }
];
const SCAN_ARC_BANDS = [
  { radius: 244, start: -36, end: 92, className: "scan-band scan-band-primary" },
  { radius: 268, start: 22, end: 118, className: "scan-band scan-band-outer" },
  { radius: 232, start: 74, end: 178, className: "scan-band scan-band-lower" },
  { radius: 198, start: 30, end: 74, className: "scan-band scan-band-inner-glint" }
];
const PRECISION_CORE_RINGS = [
  { radius: 10, className: "precision-ring precision-ring-bright", dash: "none" },
  { radius: 22, className: "precision-ring precision-ring-thin", dash: "2 6" },
  { radius: 34, className: "precision-ring precision-ring-soft", dash: "none" },
  { radius: 48, className: "precision-ring precision-ring-arc", arcs: [[-150, -18], [34, 126], [190, 286]] }
];
const MICRO_MARKER_ARCS = [
  { radius: 232, start: -8, end: 68, step: 9, type: "block", className: "marker-right" },
  { radius: 218, start: -62, end: -18, step: 11, type: "tick", className: "marker-upper" },
  { radius: 178, start: 118, end: 184, step: 12, type: "block", className: "marker-lower" },
  { radius: 206, start: -174, end: -122, step: 8, type: "dot", className: "marker-left" }
];
const DOTTED_TEXTURE_FIELDS = [
  { radius: 176, start: -176, end: -98, step: 4, rows: 7, rowGap: 3.4, className: "texture-left-dense" },
  { radius: 204, start: -164, end: -78, step: 5.2, rows: 5, rowGap: 3.1, className: "texture-left-soft" },
  { radius: 154, start: 126, end: 194, step: 6, rows: 4, rowGap: 3.2, className: "texture-bottom-left" },
  { radius: 220, start: 42, end: 106, step: 8, rows: 3, rowGap: 3.8, className: "texture-right-sparse" }
];
const LABEL_OFFSETS = [
  { r: 50, x: 18, y: -20 },
  { r: 45, x: 42, y: 2 },
  { r: 40, x: 30, y: 26 },
  { r: 46, x: -22, y: 26 },
  { r: 38, x: -44, y: 4 },
  { r: 48, x: -28, y: -20 }
];
const SECTOR_COLORS = [
  { fill: "rgba(91, 139, 145, 0.36)", hoverFill: "rgba(91, 139, 145, 0.52)", stroke: "rgba(47, 88, 96, 0.68)" },
  { fill: "rgba(116, 158, 151, 0.32)", hoverFill: "rgba(116, 158, 151, 0.49)", stroke: "rgba(47, 88, 96, 0.63)" },
  { fill: "rgba(119, 144, 171, 0.33)", hoverFill: "rgba(119, 144, 171, 0.5)", stroke: "rgba(47, 88, 96, 0.62)" },
  { fill: "rgba(139, 157, 130, 0.31)", hoverFill: "rgba(139, 157, 130, 0.48)", stroke: "rgba(47, 88, 96, 0.6)" },
  { fill: "rgba(94, 143, 137, 0.3)", hoverFill: "rgba(94, 143, 137, 0.47)", stroke: "rgba(47, 88, 96, 0.6)" },
  { fill: "rgba(73, 119, 126, 0.34)", hoverFill: "rgba(73, 119, 126, 0.5)", stroke: "rgba(47, 88, 96, 0.65)" }
];

export default function DynamicRadarChart({ endpoint = RADAR_API_PATH }) {
  const [radarData, setRadarData] = useState(() => normalizeRadarData(EMPTY_RADAR_DATA));
  const [status, setStatus] = useState("connecting");
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, index: 0 });
  const svgRef = useRef(null);
  const sectorRefs = useRef([]);
  const textureRefs = useRef([]);
  const sectorEdgeRefs = useRef([]);
  const ringRefs = useRef([]);
  const compositionArcRefs = useRef([]);
  const scanBandRefs = useRef([]);
  const orbitalDotRefs = useRef([]);
  const textureDotRefs = useRef([]);
  const microMarkerRefs = useRef([]);
  const precisionRingRefs = useRef([]);
  const axisRefs = useRef([]);
  const labelRefs = useRef([]);
  const valueTextRefs = useRef([]);
  const centerDotRef = useRef(null);
  const dataPanelRef = useRef(null);
  const dataPanelRowRefs = useRef([]);
  const dataPanelBarRefs = useRef([]);
  const dataPanelScoreRefs = useRef([]);
  const dataPanelScanRefs = useRef([]);
  const dataStatusBadgeRef = useRef(null);
  const dataPanelDidIntro = useRef(false);
  const previousDataPanelValues = useRef(null);
  const radiusStates = useRef(Array.from({ length: AXIS_COUNT }, () => ({ radius: 0, value: 0 })));
  const didIntro = useRef(false);
  const pulseTweens = useRef([]);

  const dimensions = radarData.dimensions;

  const ticks = useMemo(() => createRingTicks(), []);
  const segments = useMemo(() => createDecorativeSegments(), []);
  const textureDots = useMemo(() => createDottedTextureDots(), []);
  const microMarkers = useMemo(() => createMicroMarkers(), []);

  useEffect(() => {
    const updateImmediately = (event) => setRadarData(normalizeRadarData(profileToRadarData(event.detail)));
    window.addEventListener("prismmind-profile-updated", updateImmediately);
    return () => window.removeEventListener("prismmind-profile-updated", updateImmediately);
  }, []);

  useEffect(() => {
    const stopPolling = createRadarPolling({
      endpoint,
      interval: 3000,
      onData: (data) => {
        setStatus(data.source === "profile-not-created" ? "empty" : "live");
        setRadarData(data);
      },
      onError: () => {
        setStatus("error");
        setRadarData({
          ...normalizeRadarData(EMPTY_RADAR_DATA),
          updatedAt: new Date().toISOString()
        });
      }
    });

    return stopPolling;
  }, [endpoint]);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.set(svgRef.current, { transformOrigin: "center center" });
      gsap.fromTo(
        svgRef.current,
        { opacity: 0, scale: 0.96 },
        { opacity: 1, scale: 1, duration: 1.15, ease: "power3.out" }
      );

      ringRefs.current.forEach((ring, index) => {
        if (!ring) {
          return;
        }

        const config = RING_CONFIGS[index % RING_CONFIGS.length];
        gsap.set(ring, {
          opacity: 0,
          scale: 0.94,
          rotation: index * 7,
          transformOrigin: "center center"
        });
        gsap.to(ring, {
          opacity: 1,
          scale: 1,
          duration: 1.18,
          delay: 0.08 + index * 0.05,
          ease: "power3.out"
        });
        gsap.to(ring, {
          rotation: config.direction * 360,
          duration: config.speed,
          repeat: -1,
          ease: "none",
          transformOrigin: "center center"
        });
      });

      compositionArcRefs.current.forEach((arc, index) => {
        if (!arc) {
          return;
        }

        gsap.set(arc, { transformOrigin: "center center" });
        gsap.to(arc, {
          opacity: index === 0 ? 0.24 : 0.16,
          duration: 4.8 + index * 0.42,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut"
        });
      });

      scanBandRefs.current.forEach((band, index) => {
        if (!band) {
          return;
        }

        gsap.set(band, {
          opacity: 0,
          rotation: index * 3,
          transformOrigin: "center center"
        });
        gsap.to(band, {
          opacity: index === 0 ? 0.24 : 0.16,
          duration: 1.35,
          delay: 0.42 + index * 0.12,
          ease: "power3.out"
        });
        gsap.to(band, {
          rotation: index % 2 === 0 ? 2.6 : -2,
          opacity: index === 0 ? 0.34 : 0.22,
          duration: 5.8 + index * 0.9,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          transformOrigin: "center center"
        });
      });

      precisionRingRefs.current.forEach((ring, index) => {
        if (!ring) {
          return;
        }

        gsap.set(ring, {
          opacity: 0,
          scale: 0.82,
          transformOrigin: "center center"
        });
        gsap.to(ring, {
          opacity: 1,
          scale: 1,
          duration: 0.85,
          delay: 0.36 + index * 0.08,
          ease: "power3.out"
        });
        gsap.to(ring, {
          rotation: index % 2 === 0 ? 360 : -360,
          duration: 18 + index * 7,
          repeat: -1,
          ease: "none",
          transformOrigin: "center center"
        });
      });

      orbitalDotRefs.current.forEach((dot, index) => {
        if (!dot) {
          return;
        }

        gsap.to(dot, {
          opacity: index % 2 === 0 ? 0.48 : 0.26,
          duration: 1.6 + (index % 5) * 0.18,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: index * 0.025
        });
      });

      textureDotRefs.current.forEach((dot, index) => {
        if (!dot) {
          return;
        }

        const targetOpacity = Number(dot.dataset.opacity) || 0.22;
        gsap.fromTo(
          dot,
          { opacity: 0 },
          {
            opacity: targetOpacity,
            duration: 1.05,
            delay: 0.22 + index * 0.003,
            ease: "power2.out"
          }
        );
        gsap.to(dot, {
          opacity: targetOpacity * 0.56,
          duration: 3.2 + (index % 11) * 0.12,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: index * 0.01
        });
      });

      microMarkerRefs.current.forEach((marker, index) => {
        if (!marker) {
          return;
        }

        gsap.fromTo(
          marker,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.7,
            delay: 0.5 + index * 0.015,
            ease: "power2.out"
          }
        );

        if (index % 7 === 0) {
          gsap.to(marker, {
            opacity: 0.34,
            duration: 2 + (index % 5) * 0.24,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
          });
        }
      });

      axisRefs.current.forEach((line, index) => {
        if (!line) {
          return;
        }

        const length = Number(line.getAttribute("data-length")) || MAX_RADIUS;
        gsap.set(line, {
          strokeDasharray: length,
          strokeDashoffset: length,
          opacity: 0
        });
        gsap.to(line, {
          opacity: 1,
          strokeDashoffset: 0,
          duration: 0.9,
          delay: 0.18 + index * 0.08,
          ease: "power3.out"
        });
      });

      gsap.fromTo(
        centerDotRef.current,
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.9, delay: 0.58, ease: "back.out(1.9)" }
      );
    }, svgRef.current);

    return () => context.revert();
  }, []);

  useEffect(() => {
    dimensions.forEach((dimension, index) => {
      const sector = sectorRefs.current[index];
      const texture = textureRefs.current[index];
      const sectorEdge = sectorEdgeRefs.current[index];
      const valueText = valueTextRefs.current[index];
      const label = labelRefs.current[index];
      const startAngle = START_ANGLE + index * ANGLE_SIZE;
      const endAngle = startAngle + ANGLE_SIZE;
      const targetRadius = (MAX_RADIUS * dimension.value) / 100;
      const state = radiusStates.current[index];
      const previousValue = state.value;
      const changed = Math.abs(previousValue - dimension.value) > 0;

      gsap.killTweensOf(state);
      gsap.to(state, {
        radius: targetRadius,
        value: dimension.value,
        duration: didIntro.current ? 0.95 : 1.28,
        delay: didIntro.current ? index * 0.04 : 0.5 + index * 0.08,
        ease: didIntro.current ? "power3.out" : "expo.out",
        onUpdate: () => {
          if (sector) {
            sector.setAttribute("d", createSectorPath(startAngle, endAngle, state.radius));
          }

          if (texture) {
            texture.setAttribute("d", createSectorPath(startAngle, endAngle, state.radius));
          }

          if (sectorEdge) {
            sectorEdge.setAttribute("d", createArcPath(Math.max(state.radius, 0.1), startAngle, endAngle));
          }

          if (valueText) {
            valueText.textContent = formatScore(state.value);
          }
        }
      });

      if (changed && didIntro.current && sector) {
        pulseTweens.current[index]?.kill();
        pulseTweens.current[index] = gsap.fromTo(
          sector,
          { filter: "drop-shadow(0 0 0 rgba(75, 126, 132, 0))" },
          {
            filter: "drop-shadow(0 0 14px rgba(75, 126, 132, 0.58))",
            duration: 0.42,
            yoyo: true,
            repeat: 1,
            ease: "power3.out"
          }
        );
      }

      if (label) {
        gsap.to(label, {
          opacity: 1,
          duration: 0.6,
          delay: didIntro.current ? 0 : 1 + index * 0.05,
          ease: "power2.out"
        });
      }
    });

    didIntro.current = true;
  }, [dimensions]);

  useEffect(() => {
    sectorRefs.current.forEach((sector, index) => {
      if (!sector) {
        return;
      }

      const isHovered = hoveredIndex === index;
      const isDimmed = hoveredIndex !== null && hoveredIndex !== index;
      gsap.to(sector, {
        opacity: isDimmed ? 0.5 : 1,
        scale: isHovered ? 1.018 : 1,
        duration: 0.24,
        ease: "power2.out",
        transformOrigin: "center center"
      });
    });

    sectorEdgeRefs.current.forEach((edge, index) => {
      if (!edge) {
        return;
      }

      gsap.to(edge, {
        opacity: hoveredIndex === index ? 0.92 : 0.5,
        strokeWidth: hoveredIndex === index ? 2 : 1.2,
        duration: 0.2,
        ease: "power2.out"
      });
    });
  }, [hoveredIndex]);

  useEffect(() => {
    const panel = dataPanelRef.current;

    if (!panel) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: 24, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.9,
          delay: 0.25,
          ease: "power3.out",
          clearProps: "transform"
        }
      );

      if (dataStatusBadgeRef.current) {
        gsap.to(dataStatusBadgeRef.current, {
          opacity: 0.62,
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: 1
        });
      }
    }, panel);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const values = dimensions.map((dimension) => dimension.value);

    if (!dataPanelDidIntro.current) {
      dataPanelRowRefs.current.forEach((row) => {
        if (row) {
          gsap.set(row, { opacity: 0, y: 8 });
        }
      });

      dataPanelBarRefs.current.forEach((bar) => {
        if (bar) {
          gsap.set(bar, { width: "0%" });
        }
      });

      dataPanelScoreRefs.current.forEach((score) => {
        if (score) {
          score.textContent = "0";
        }
      });

      let introCompleted = false;
      const restoreVisibleState = () => {
        values.forEach((value, index) => {
          const row = dataPanelRowRefs.current[index];
          const bar = dataPanelBarRefs.current[index];
          const score = dataPanelScoreRefs.current[index];
          const scan = dataPanelScanRefs.current[index];

          if (row) {
            gsap.set(row, { opacity: 1, y: 0 });
          }

          if (bar) {
            gsap.set(bar, { width: `${value}%` });
          }

          if (score) {
            score.textContent = formatScore(value);
          }

          if (scan) {
            gsap.set(scan, { opacity: 0, x: 0 });
          }
        });
      };

      const timeline = gsap.timeline({
        delay: 0.58,
        onComplete: () => {
          introCompleted = true;
          previousDataPanelValues.current = values;
          dataPanelDidIntro.current = true;
          restoreVisibleState();
        }
      });

      values.forEach((value, index) => {
        const row = dataPanelRowRefs.current[index];
        const bar = dataPanelBarRefs.current[index];
        const score = dataPanelScoreRefs.current[index];
        const scan = dataPanelScanRefs.current[index];
        const startAt = index * 0.08;

        if (row) {
          timeline.to(
            row,
            {
              opacity: 1,
              y: 0,
              duration: 0.46,
              ease: "power3.out"
            },
            startAt
          );
        }

        if (bar) {
          timeline.to(
            bar,
            {
              width: `${value}%`,
              duration: 0.88,
              ease: "power3.out",
              overwrite: true
            },
            startAt + 0.08
          );
        }

        if (score) {
          const counter = { value: 0 };
          timeline.to(
            counter,
            {
              value,
              duration: 0.88,
              ease: "power3.out",
              onUpdate: () => {
                score.textContent = formatScore(counter.value);
              }
            },
            startAt + 0.08
          );
        }

        if (scan) {
          timeline.fromTo(
            scan,
            { x: -32, opacity: 0 },
            {
              x: () => (scan.parentElement?.getBoundingClientRect().width ?? 180) + 32,
              opacity: 0.72,
              duration: 0.72,
              ease: "power2.out",
              onComplete: () => {
                gsap.set(scan, { opacity: 0, x: 0 });
              }
            },
            startAt + 0.1
          );
        }
      });

      return () => {
        timeline.kill();

        if (!introCompleted) {
          dataPanelDidIntro.current = false;
          restoreVisibleState();
        }
      };
    }

    const previousValues = previousDataPanelValues.current ?? values;
    const updateTweens = [];

    values.forEach((value, index) => {
      const previousValue = previousValues[index] ?? 0;

      if (previousValue === value) {
        return;
      }

      const row = dataPanelRowRefs.current[index];
      const bar = dataPanelBarRefs.current[index];
      const score = dataPanelScoreRefs.current[index];
      const scan = dataPanelScanRefs.current[index];

      if (bar) {
        gsap.killTweensOf(bar);
        updateTweens.push(
          gsap.to(bar, {
            width: `${value}%`,
            duration: 0.82,
            ease: "power3.out",
            overwrite: true
          })
        );
      }

      if (score) {
        const counter = { value: previousValue };
        score.textContent = formatScore(previousValue);
        updateTweens.push(
          gsap.to(counter, {
            value,
            duration: 0.82,
            ease: "power3.out",
            onUpdate: () => {
              score.textContent = formatScore(counter.value);
            }
          })
        );
      }

      if (row) {
        gsap.killTweensOf(row);
        updateTweens.push(
          gsap.fromTo(
            row,
            { backgroundColor: "rgba(47, 88, 96, 0)", boxShadow: "inset 0 0 0 1px rgba(47, 88, 96, 0)" },
            {
              backgroundColor: "rgba(47, 88, 96, 0.07)",
              boxShadow: "inset 0 0 0 1px rgba(47, 88, 96, 0.12)",
              duration: 0.36,
              repeat: 1,
              yoyo: true,
              ease: "sine.inOut",
              clearProps: "backgroundColor,boxShadow"
            }
          )
        );
      }

      if (scan) {
        gsap.killTweensOf(scan);
        updateTweens.push(
          gsap.fromTo(
            scan,
            { x: -32, opacity: 0 },
            {
              x: () => (scan.parentElement?.getBoundingClientRect().width ?? 180) + 32,
              opacity: 0.78,
              duration: 0.68,
              ease: "power2.out",
              onComplete: () => {
                gsap.set(scan, { opacity: 0, x: 0 });
              }
            }
          )
        );
      }
    });

    previousDataPanelValues.current = values;

    return () => {
      updateTweens.forEach((tween) => tween.kill());
    };
  }, [dimensions]);

  const handlePointerMove = (event, index) => {
    const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      index
    });
  };

  const currentTooltipDimension = dimensions[tooltip.index] ?? dimensions[0];

  return (
    <section className="dynamic-radar-shell">
      <div className="radar-copy" aria-hidden="true">
        <span className="radar-kicker">RADAR PROFILE</span>
        <span className="radar-microcopy">6D telemetry surface</span>
      </div>

      <div className="radar-visual-wrap">
        <svg
          ref={svgRef}
          className="dynamic-radar-svg"
          viewBox={VIEW_BOX}
          role="img"
          aria-label="Six dimension dynamic radial sector chart"
        >
          <defs>
            <radialGradient id="sectorTexture" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="48%" stopColor="#9ab8b2" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#263f45" stopOpacity="0.08" />
            </radialGradient>
            <radialGradient id="centerLens" cx="44%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#fbfaf3" stopOpacity="0.94" />
              <stop offset="42%" stopColor="#cbd9d4" stopOpacity="0.44" />
              <stop offset="100%" stopColor="#2f5860" stopOpacity="0.16" />
            </radialGradient>
            <radialGradient id="centerPin" cx="42%" cy="36%" r="58%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
              <stop offset="68%" stopColor="#edf3ef" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2f5860" stopOpacity="0.28" />
            </radialGradient>
            <linearGradient id="scanBandWash" x1="-1" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2f5860" stopOpacity="0.04" />
              <stop offset="46%" stopColor="#2f5860" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#2f5860" stopOpacity="0.07" />
            </linearGradient>
            <pattern id="microDots" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="1.4" cy="1.4" r="0.75" fill="#345e64" opacity="0.2" />
            </pattern>
            <filter id="paperBlur">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="table" tableValues="0 0.12" />
              </feComponentTransfer>
            </filter>
            <filter id="scanGrain">
              <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="7" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="table" tableValues="0 0.22" />
              </feComponentTransfer>
              <feBlend mode="multiply" in2="SourceGraphic" />
            </filter>
          </defs>

          <rect x="-300" y="-300" width="600" height="600" fill="transparent" filter="url(#paperBlur)" opacity="0.18" />

          <g className="radar-poster-guides" aria-hidden="true">
            <path className="guide-line guide-top" d="M -286 -238 H 118" strokeDasharray="3 14" />
            <path className="guide-line guide-axis" d="M 0 -286 V 286" />
            <path className="guide-line guide-cross" d="M -286 0 H 248" />
            <path className="guide-line guide-diagonal" d="M -240 250 L 246 -236" strokeDasharray="5 9" />
            <path className="guide-line guide-diagonal-soft" d="M -188 -214 L 276 118" />
            <circle className="guide-node guide-node-a" cx="-236" cy="0" r="3.8" />
            <circle className="guide-node guide-node-b" cx="218" cy="-218" r="3.8" />
            <circle className="guide-node guide-node-c" cx="-178" cy="210" r="3.2" />
          </g>

          <g className="radar-composition-arcs" aria-hidden="true">
            {COMPOSITION_ARCS.map((arc, index) => (
              <path
                key={`${arc.radius}-${arc.start}`}
                ref={(node) => {
                  compositionArcRefs.current[index] = node;
                }}
                className={arc.className}
                d={createArcPath(arc.radius, arc.start, arc.end)}
              />
            ))}
          </g>

          <g className="radar-scan-bands" aria-hidden="true">
            {SCAN_ARC_BANDS.map((band, index) => (
              <path
                key={`${band.radius}-${band.start}`}
                ref={(node) => {
                  scanBandRefs.current[index] = node;
                }}
                className={band.className}
                d={createArcPath(band.radius, band.start, band.end)}
              />
            ))}
          </g>

          <g className="radar-dotted-texture-rings" aria-hidden="true">
            {textureDots.map((dot, index) => (
              <circle
                key={`${dot.className}-${index}`}
                ref={(node) => {
                  textureDotRefs.current[index] = node;
                }}
                className={`texture-dot ${dot.className}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.size}
                data-opacity={dot.opacity}
              />
            ))}
          </g>

          <g className="radar-poster-bars" aria-hidden="true">
            <path d="M -278 174 H -224" />
            <path d="M -278 188 H -196" />
            <path d="M -278 202 H -236" />
            <path className="bar-muted" d="M -220 174 H -176" strokeDasharray="8 9" />
            <path className="bar-muted" d="M -190 202 H -150" strokeDasharray="4 9" />
            <path d="M 246 38 H 286" />
            <path d="M 236 56 H 274" />
            <path d="M 224 74 H 264" />
            <path className="bar-muted" d="M 252 92 H 284" strokeDasharray="6 8" />
          </g>

          <g className="radar-rings" aria-hidden="true">
            {RING_CONFIGS.map((config, index) => {
              const radius = (MAX_RADIUS * config.value) / 100;
              return (
                <g
                  key={config.value}
                  ref={(node) => {
                    ringRefs.current[index] = node;
                  }}
                  className={`radar-ring ${config.className}`}
                >
                  {config.full ? <circle className="radar-functional-circle" r={radius} strokeDasharray={config.dash} /> : null}
                  {(config.arcs ?? []).map(([start, end]) => (
                    <path
                      key={`${config.value}-${start}-${end}`}
                      className="radar-functional-arc"
                      d={createArcPath(radius, start, end)}
                      strokeDasharray={config.dash}
                    />
                  ))}
                  {segments
                    .filter((segment) => segment.ringIndex === index)
                    .map((segment) => (
                      <path
                        key={`${segment.ringIndex}-${segment.angle}-${segment.length}`}
                        className="radar-ring-segment"
                        d={createArcPath(radius, segment.angle, segment.angle + segment.length)}
                      />
                    ))}
                  {config.dots
                    ? createOrbitDots(radius, index).map((dot, dotIndex) => {
                        const point = polarToCartesian(dot.radius, dot.angle);
                        return (
                          <circle
                            key={`${config.value}-dot-${dot.angle}`}
                            ref={(node) => {
                              orbitalDotRefs.current[index * 40 + dotIndex] = node;
                            }}
                            className="radar-orbit-dot"
                            cx={point.x}
                            cy={point.y}
                            r={dot.size}
                          />
                        );
                      })
                    : null}
                  {ticks
                    .filter((tick) => tick.ringIndex === index)
                    .map((tick) => {
                      const point = polarToCartesian(tick.radius, tick.angle);
                      return (
                        <rect
                          key={`${tick.ringIndex}-${tick.angle}`}
                          x={point.x - 1.6}
                          y={point.y - 1.6}
                          width="3.2"
                          height="3.2"
                          rx="0.4"
                          transform={`rotate(${tick.angle} ${point.x} ${point.y})`}
                        />
                      );
                    })}
                </g>
              );
            })}
            <circle className="radar-outer-boundary" r={MAX_RADIUS} />
          </g>

          <g className="radar-micro-markers" aria-hidden="true">
            {microMarkers.map((marker, index) => {
              if (marker.type === "dot") {
                return (
                  <circle
                    key={`micro-dot-${index}`}
                    ref={(node) => {
                      microMarkerRefs.current[index] = node;
                    }}
                    className={`micro-marker ${marker.className}`}
                    cx={marker.x}
                    cy={marker.y}
                    r={marker.size}
                  />
                );
              }

              if (marker.type === "tick") {
                return (
                  <line
                    key={`micro-tick-${index}`}
                    ref={(node) => {
                      microMarkerRefs.current[index] = node;
                    }}
                    className={`micro-marker ${marker.className}`}
                    x1={marker.x1}
                    y1={marker.y1}
                    x2={marker.x2}
                    y2={marker.y2}
                  />
                );
              }

              return (
                <rect
                  key={`micro-block-${index}`}
                  ref={(node) => {
                    microMarkerRefs.current[index] = node;
                  }}
                  className={`micro-marker ${marker.className}`}
                  x={marker.x - marker.width / 2}
                  y={marker.y - marker.height / 2}
                  width={marker.width}
                  height={marker.height}
                  rx="0.45"
                  transform={`rotate(${marker.angle} ${marker.x} ${marker.y})`}
                />
              );
            })}
          </g>

          <g className="radar-axis-lines" aria-hidden="true">
            {Array.from({ length: AXIS_COUNT }, (_, index) => {
              const angle = START_ANGLE + index * ANGLE_SIZE;
              const point = polarToCartesian(MAX_RADIUS + 12, angle);
              return (
                <line
                  key={angle}
                  ref={(node) => {
                    axisRefs.current[index] = node;
                  }}
                  x1="0"
                  y1="0"
                  x2={point.x}
                  y2={point.y}
                  data-length={MAX_RADIUS + 12}
                />
              );
            })}
          </g>

          <g className="radar-sectors">
            {dimensions.map((dimension, index) => {
              const startAngle = START_ANGLE + index * ANGLE_SIZE;
              const endAngle = startAngle + ANGLE_SIZE;
              const labelOffset = LABEL_OFFSETS[index];
              const labelPoint = polarToCartesian(MAX_RADIUS + labelOffset.r, startAngle + ANGLE_SIZE / 2);
              const clipPath = createSectorPath(startAngle, endAngle, MAX_RADIUS);
              const color = SECTOR_COLORS[index];

              return (
                <g key={dimension.id} className="radar-sector-group">
                  <path
                    className="radar-sector-hit"
                    d={clipPath}
                    onPointerEnter={() => setHoveredIndex(index)}
                    onPointerMove={(event) => handlePointerMove(event, index)}
                    onPointerLeave={() => {
                      setHoveredIndex(null);
                      setTooltip((current) => ({ ...current, visible: false }));
                    }}
                  />
                  <path
                    ref={(node) => {
                      sectorRefs.current[index] = node;
                    }}
                    className="radar-sector"
                    d={createSectorPath(startAngle, endAngle, 0.1)}
                    fill={hoveredIndex === index ? color.hoverFill : color.fill}
                    stroke={color.stroke}
                  />
                  <path
                    ref={(node) => {
                      textureRefs.current[index] = node;
                    }}
                    className="radar-sector-texture"
                    d={createSectorPath(startAngle, endAngle, 0.1)}
                  />
                  <path
                    ref={(node) => {
                      sectorEdgeRefs.current[index] = node;
                    }}
                    className="radar-sector-scan-edge"
                    d={createArcPath(0.1, startAngle, endAngle)}
                  />
                  <text
                    ref={(node) => {
                      labelRefs.current[index] = node;
                    }}
                    className="radar-dimension-label"
                    x={labelPoint.x + labelOffset.x}
                    y={labelPoint.y + labelOffset.y - 8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {dimension.label}
                  </text>
                  <text
                    ref={(node) => {
                      valueTextRefs.current[index] = node;
                    }}
                    className="radar-value-label"
                    x={labelPoint.x + labelOffset.x}
                    y={labelPoint.y + labelOffset.y + 9}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    00
                  </text>
                </g>
              );
            })}
          </g>

          <g className="radar-divider-lines" aria-hidden="true">
            {Array.from({ length: AXIS_COUNT }, (_, index) => {
              const angle = START_ANGLE + index * ANGLE_SIZE;
              const point = polarToCartesian(MAX_RADIUS, angle);
              return <line key={`divider-${angle}`} x1="0" y1="0" x2={point.x} y2={point.y} />;
            })}
          </g>

          <g className="radar-precision-core-rings" aria-hidden="true">
            {PRECISION_CORE_RINGS.map((ring, index) => (
              <g
                key={`precision-${ring.radius}`}
                ref={(node) => {
                  precisionRingRefs.current[index] = node;
                }}
                className={ring.className}
              >
                {ring.arcs
                  ? ring.arcs.map(([start, end]) => (
                      <path key={`${ring.radius}-${start}`} d={createArcPath(ring.radius, start, end)} />
                    ))
                  : <circle r={ring.radius} strokeDasharray={ring.dash} />}
              </g>
            ))}
          </g>

          <g className="radar-scale-labels" aria-hidden="true">
            {SCALE_LABELS.map((value, index) => {
              const point = polarToCartesian((MAX_RADIUS * value) / 100, -8);
              return (
                <text
                  key={value}
                  className={value === 100 ? "scale-boundary" : value % 20 === 0 ? "scale-even" : "scale-odd"}
                  x={point.x + 8}
                  y={point.y + index * 0.15}
                >
                  {value}
                </text>
              );
            })}
          </g>

          <g className="radar-center" ref={centerDotRef} aria-hidden="true">
            <circle r="54" className="radar-center-field" />
            <circle r="45" className="radar-center-outer" />
            <circle r="30" className="radar-center-halo" />
            <circle r="24" className="radar-center-lens" />
            <path className="radar-center-gleam" d={createArcPath(25, -136, -34)} />
            <path className="radar-center-index" d={createArcPath(39, 26, 112)} />
            <circle r="18" className="radar-center-ring" />
            <circle r="7" className="radar-center-inner" />
            <circle r="3.6" className="radar-center-dot" />
            <circle r="1.6" className="radar-center-spark" />
            <line x1="-56" y1="0" x2="56" y2="0" />
            <line x1="0" y1="-56" x2="0" y2="56" />
          </g>
        </svg>

        {tooltip.visible && currentTooltipDimension ? (
          <div
            className="radar-tooltip"
            style={{
              transform: `translate3d(${tooltip.x + 14}px, ${tooltip.y + 14}px, 0)`
            }}
          >
          <span>维度：{currentTooltipDimension.label}</span>
            <strong>{formatScore(currentTooltipDimension.value)} / 100</strong>
          </div>
        ) : null}
      </div>

      <div className="right-panel-column">
        <ChatPanel />

        <aside ref={dataPanelRef} className="radar-data-panel" aria-label="学习画像维度面板">
          <div className="panel-header">
            <span>画像维度</span>
            <span ref={dataStatusBadgeRef} className={`status-pill status-${status}`}>{statusLabel(status)}</span>
          </div>
          <div className="panel-values">
            {dimensions.map((dimension, index) => (
              <div
                key={dimension.id}
                ref={(node) => {
                  dataPanelRowRefs.current[index] = node;
                }}
                className="panel-row"
              >
                <span className="panel-index">{dimension.label}</span>
                <span className="panel-bar" aria-hidden="true">
                  <span
                    ref={(node) => {
                      dataPanelBarRefs.current[index] = node;
                    }}
                    className="panel-bar-fill"
                    style={{ width: `${dimension.value}%` }}
                  />
                  <span
                    ref={(node) => {
                      dataPanelScanRefs.current[index] = node;
                    }}
                    className="panel-bar-scan"
                  />
                </span>
                <span
                  ref={(node) => {
                    dataPanelScoreRefs.current[index] = node;
                  }}
                  className="panel-score"
                >
                  {formatScore(dimension.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="panel-footer">
            <span>{formatUpdatedAt(radarData.updatedAt)}</span>
            {status === "empty" ? <span>请先创建学习画像</span> : <span>{status === "error" ? "画像数据暂不可用" : "真实画像数据"}</span>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function createSectorPath(startAngle, endAngle, radius) {
  const safeRadius = Math.max(radius, 0.1);
  const start = polarToCartesian(safeRadius, startAngle);
  const end = polarToCartesian(safeRadius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    "M 0 0",
    `L ${formatNumber(start.x)} ${formatNumber(start.y)}`,
    `A ${formatNumber(safeRadius)} ${formatNumber(safeRadius)} 0 ${largeArcFlag} 1 ${formatNumber(end.x)} ${formatNumber(end.y)}`,
    "Z"
  ].join(" ");
}

function createArcPath(radius, startAngle, endAngle) {
  const start = polarToCartesian(radius, startAngle);
  const end = polarToCartesian(radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${formatNumber(start.x)} ${formatNumber(start.y)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 ${largeArcFlag} 1 ${formatNumber(end.x)} ${formatNumber(end.y)}`
  ].join(" ");
}

function polarToCartesian(radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: radius * Math.cos(angleInRadians),
    y: radius * Math.sin(angleInRadians)
  };
}

function createRingTicks() {
  return RING_CONFIGS.flatMap((ring, ringIndex) => {
    if (!ring.ticks) {
      return [];
    }

    const radius = (MAX_RADIUS * ring.value) / 100;
    const interval = ring.value === 90 ? 18 : 30;
    return Array.from({ length: Math.floor(360 / interval) }, (_, index) => ({
      ringIndex,
      radius,
      angle: index * interval + ringIndex * 5
    })).filter((tick) => shouldKeepTick(ring.value, tick.angle));
  });
}

function createDecorativeSegments() {
  return RING_CONFIGS.flatMap((ring, ringIndex) => {
    if (!ring.segments) {
      return [];
    }

    const count = ring.value === 80 ? 7 : 4;
    return Array.from({ length: count }, (_, index) => ({
      ringIndex,
      angle: ring.value === 80 ? -38 + index * 24 : -120 + index * 82,
      length: ring.value === 80 ? 12 + (index % 3) * 5 : 18 + index * 4
    }));
  });
}

function createOrbitDots(radius, ringIndex) {
  const denseAngles =
    ringIndex >= 8
      ? rangeAngles(18, 126, 8).concat(rangeAngles(184, 252, 10))
      : rangeAngles(-152, -72, 9).concat(rangeAngles(120, 206, 12));

  return denseAngles.map((angle, index) => ({
    angle,
    radius: radius + (index % 3) * 0.8,
    size: ringIndex >= 8 ? 1.6 : 1.2
  }));
}

function createDottedTextureDots() {
  return DOTTED_TEXTURE_FIELDS.flatMap((field) => {
    const angles = rangeAngles(field.start, field.end, field.step);
    return Array.from({ length: field.rows }, (_, row) => {
      const rowRadius = field.radius + row * field.rowGap;
      const rowFade = 1 - row / (field.rows + 1);

      return angles.map((angle, angleIndex) => {
        const point = polarToCartesian(rowRadius + ((angleIndex + row) % 2) * 0.8, angle + row * 0.45);
        const angleFade = 1 - angleIndex / (angles.length + 4);
        return {
          x: point.x,
          y: point.y,
          size: 0.42 + rowFade * 0.34,
          opacity: 0.08 + rowFade * angleFade * 0.28,
          className: field.className
        };
      });
    }).flat();
  });
}

function createMicroMarkers() {
  return MICRO_MARKER_ARCS.flatMap((arc) => {
    const angles = rangeAngles(arc.start, arc.end, arc.step);
    return angles.map((angle, index) => {
      const basePoint = polarToCartesian(arc.radius + (index % 2) * 2, angle);

      if (arc.type === "dot") {
        return {
          type: "dot",
          x: basePoint.x,
          y: basePoint.y,
          size: 1.35 + (index % 3) * 0.28,
          className: arc.className
        };
      }

      if (arc.type === "tick") {
        const inner = polarToCartesian(arc.radius - 3, angle);
        const outer = polarToCartesian(arc.radius + 5 + (index % 2) * 2, angle);
        return {
          type: "tick",
          x1: inner.x,
          y1: inner.y,
          x2: outer.x,
          y2: outer.y,
          className: arc.className
        };
      }

      return {
        type: "block",
        x: basePoint.x,
        y: basePoint.y,
        angle: angle + 90,
        width: index % 4 === 0 ? 5.8 : 3.8,
        height: index % 4 === 0 ? 2.8 : 2.2,
        className: arc.className
      };
    });
  });
}

function rangeAngles(start, end, step) {
  const values = [];
  for (let angle = start; angle <= end; angle += step) {
    values.push(angle);
  }
  return values;
}

function shouldKeepTick(value, angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (value === 90) {
    return normalized < 140 || normalized > 178;
  }

  if (value === 70) {
    return normalized < 120 || normalized > 210;
  }

  return true;
}

function formatNumber(value) {
  return Number(value.toFixed(3));
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function formatUpdatedAt(value) {
  if (!value) {
    return "暂无更新时间";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function statusLabel(status) {
  if (status === "live") {
    return "实时";
  }

  if (status === "empty") {
    return "待创建";
  }

  if (status === "error") {
    return "异常";
  }

  return "同步中";
}
