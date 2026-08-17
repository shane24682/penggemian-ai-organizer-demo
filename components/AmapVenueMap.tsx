"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../lib/location";

type MapVenue = {
  id: string;
  name: string;
  coordinate: Coordinate;
  pricePerHour?: number;
  openHours?: string;
  rating?: number;
};

type Props = {
  center: Coordinate;
  venues?: MapVenue[];
  selectedVenueId?: string;
  onSelectVenue?: (id: string) => void;
  onPickLocation?: (location: Coordinate) => void;
  compact?: boolean;
};

type AMapRuntime = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => {
    add: (items: unknown | unknown[]) => void;
    addControl: (control: unknown) => void;
    on: (event: string, handler: (event: { lnglat: { getLat: () => number; getLng: () => number } }) => void) => void;
    setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
    destroy: () => void;
  };
  Marker: new (options: Record<string, unknown>) => { on: (event: string, handler: () => void) => void };
  Scale: new () => unknown;
  Pixel: new (x: number, y: number) => unknown;
};

declare global {
  interface Window {
    AMapLoader?: { load: (options: Record<string, unknown>) => Promise<AMapRuntime> };
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}

const amapKey = import.meta.env.VITE_AMAP_KEY || "";
const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE || "";
const amapServiceHost = import.meta.env.VITE_AMAP_SERVICE_HOST || "";

let loaderPromise: Promise<AMapRuntime> | null = null;

function loadAmap() {
  if (!amapKey) return Promise.reject(new Error("AMAP_KEY_MISSING"));
  if (loaderPromise) return loaderPromise;
  window._AMapSecurityConfig = amapServiceHost
    ? { serviceHost: amapServiceHost.replace(/\/$/, "") + "/_AMapService" }
    : { securityJsCode: amapSecurityCode };
  loaderPromise = new Promise<void>((resolve, reject) => {
    if (window.AMapLoader) { resolve(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-penggemian-amap="loader"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("AMAP_LOADER_FAILED")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://webapi.amap.com/loader.js";
    script.async = true;
    script.dataset.penggemianAmap = "loader";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AMAP_LOADER_FAILED"));
    document.head.appendChild(script);
  }).then(() => window.AMapLoader!.load({
    key: amapKey,
    version: "2.0",
    plugins: ["AMap.Scale"],
  }));
  return loaderPromise;
}

function makeMarkerContent(label: string, selected = false, user = false) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = `amap-pin ${selected ? "selected" : ""} ${user ? "user" : ""}`;
  root.setAttribute("aria-label", label);
  const dot = document.createElement("span");
  dot.textContent = user ? "我" : "场";
  root.appendChild(dot);
  if (!user) {
    const text = document.createElement("b");
    text.textContent = label;
    root.appendChild(text);
  }
  return root;
}

export default function AmapVenueMap({ center, venues = [], selectedVenueId, onSelectVenue, onPickLocation, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(amapKey ? "loading" : "missing");

  useEffect(() => {
    if (!amapKey || !containerRef.current) return;
    let disposed = false;
    let map: InstanceType<AMapRuntime["Map"]> | null = null;
    setState("loading");
    loadAmap().then(AMap => {
      if (disposed || !containerRef.current) return;
      map = new AMap.Map(containerRef.current, {
        center: [center.lng, center.lat],
        zoom: venues.length ? 13.8 : 15,
        viewMode: "2D",
        mapStyle: "amap://styles/whitesmoke",
      });
      map.addControl(new AMap.Scale());
      const overlays: Array<InstanceType<AMapRuntime["Marker"]>> = [];
      const userMarker = new AMap.Marker({
        position: [center.lng, center.lat],
        content: makeMarkerContent("我的大致位置", false, true),
        offset: new AMap.Pixel(-18, -18),
        zIndex: 120,
      });
      overlays.push(userMarker);
      venues.forEach(venue => {
        const marker = new AMap.Marker({
          position: [venue.coordinate.lng, venue.coordinate.lat],
          title: venue.name,
          content: makeMarkerContent(venue.name, selectedVenueId === venue.id),
          offset: new AMap.Pixel(-18, -40),
          zIndex: selectedVenueId === venue.id ? 110 : 100,
        });
        marker.on("click", () => onSelectVenue?.(venue.id));
        overlays.push(marker);
      });
      map.add(overlays);
      if (overlays.length > 1) map.setFitView(overlays, false, [68, 54, 68, 54]);
      if (onPickLocation) {
        map.on("click", event => onPickLocation({
          lat: Number(event.lnglat.getLat().toFixed(6)),
          lng: Number(event.lnglat.getLng().toFixed(6)),
          label: "高德地图选点",
        }));
      }
      setState("ready");
    }).catch(() => !disposed && setState("error"));
    return () => {
      disposed = true;
      map?.destroy();
    };
  }, [center, venues, selectedVenueId, onSelectVenue, onPickLocation]);

  if (state === "missing") return <div className={`amap-fallback ${compact ? "compact" : ""}`}>
    <div><span>高</span><div><b>高德地图接口已接入，等待配置 Key</b><p>配置后即可在此点选位置，并在成局后查看场馆标记。</p></div></div>
    <small>需要 Web端（JS API）Key 与安全密钥</small>
  </div>;

  return <div className={`amap-shell ${compact ? "compact" : ""}`}>
    <div ref={containerRef} className="amap-container" aria-label="高德地图选址" />
    {state === "loading" && <div className="amap-status">正在加载高德地图…</div>}
    {state === "error" && <div className="amap-status error">地图加载失败，请检查 Key、白名单和安全密钥</div>}
    <div className="amap-brand"><span>高德地图</span><small>{onPickLocation ? "点击地图更新大致位置" : "点击场馆标记切换选择"}</small></div>
  </div>;
}

