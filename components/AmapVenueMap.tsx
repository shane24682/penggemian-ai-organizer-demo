"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Coordinate } from "../lib/location";
import { haversineKm, buildAmapNavigationUrl } from "../lib/location";

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

type SearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type JsonpPoi = {
  name: string;
  address?: string;
  location?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
};

type JsonpResponse = {
  status: string;
  info: string;
  pois?: JsonpPoi[];
};

let jsonpCounter = 0;

function jsonpPlaceSearch(keyword: string): Promise<JsonpPoi[]> {
  return new Promise((resolve, reject) => {
    const cbName = `_pgmSearchCb${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[cbName];
      script.remove();
    };
    (window as unknown as Record<string, unknown>)[cbName] = (data: JsonpResponse) => {
      cleanup();
      if (data && data.status === "1" && Array.isArray(data.pois)) {
        resolve(data.pois.filter(poi => poi.location && poi.location.includes(",")));
      } else {
        resolve([]);
      }
    };
    script.onerror = () => { cleanup(); reject(new Error("AMAP_JSONP_FAILED")); };
    // replicate JS API 2.0 plugin request params (required: USERKEY_PLAT_NOMATCH otherwise)
    const csid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
    const params = new URLSearchParams();
    params.set("platform", "JS");
    params.set("s", "rsv3");
    params.set("logversion", "2.0");
    params.set("key", amapKey);
    params.set("sdkversion", "2.3.5.6");
    params.set("appname", encodeURIComponent(encodeURIComponent(window.location.origin + "/")));
    params.set("csid", csid);
    params.set("jscode", amapSecurityCode);
    params.set("city", "杭州");
    params.set("citylimit", "false");
    params.set("offset", "8");
    params.set("page", "1");
    params.set("language", "zh_cn");
    params.set("children", "");
    params.set("type_", "KEYWORD");
    params.set("antiCrab", "true");
    params.set("keywords", keyword);
    params.set("callback", cbName);
    script.src = `https://restapi.amap.com/v3/place/text?${params.toString()}`;
    script.dataset.penggemianJsonp = "search";
    document.head.appendChild(script);
    window.setTimeout(() => {
      if ((window as unknown as Record<string, unknown>)[cbName]) {
        cleanup();
        resolve([]);
      }
    }, 8000);
  });
}

type AMapRuntime = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => {
    add: (items: unknown | unknown[]) => void;
    remove: (items: unknown | unknown[]) => void;
    addControl: (control: unknown) => void;
    on: (event: string, handler: (event: { lnglat: { getLat: () => number; getLng: () => number } }) => void) => void;
    setCenter: (lnglat: [number, number]) => void;
    setZoom: (zoom: number) => void;
    setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
    destroy: () => void;
  };
  Marker: new (options: Record<string, unknown>) => { on: (event: string, handler: () => void) => void; setMap: (map: unknown) => void };
  Scale: new () => unknown;
  Pixel: new (x: number, y: number) => unknown;
  Autocomplete: new (options: Record<string, unknown>) => {
    search: (keyword: string, callback: (status: string, result: { tips: Array<{ name: string; district: string; location: { getLat: () => number; getLng: () => number } | null }> }) => void) => void;
  };
  PlaceSearch: new (options: Record<string, unknown>) => {
    search: (keyword: string, callback: (status: string, result: { pois: Array<{ name: string; address: string; location: { getLat: () => number; getLng: () => number } }>; info: string }) => void) => void;
  };
  Polyline: new (options: Record<string, unknown>) => { setMap: (map: unknown) => void };
  InfoWindow: new (options: Record<string, unknown>) => {
    setContent: (content: string) => void;
    open: (map: unknown, lnglat: [number, number]) => void;
    close: () => void;
  };
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
    plugins: ["AMap.Scale", "AMap.Autocomplete", "AMap.PlaceSearch", "AMap.Polyline"],
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

function makeDestMarkerContent(label: string) {
  const root = document.createElement("div");
  root.className = "amap-pin dest";
  const dot = document.createElement("span");
  dot.textContent = "去";
  root.appendChild(dot);
  const text = document.createElement("b");
  text.textContent = label;
  root.appendChild(text);
  return root;
}

export default function AmapVenueMap({ center, venues = [], selectedVenueId, onSelectVenue, onPickLocation, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: InstanceType<AMapRuntime["Map"]>; amap: AMapRuntime } | null>(null);
  const destMarkerRef = useRef<InstanceType<AMapRuntime["Marker"]> | null>(null);
  const polylineRef = useRef<InstanceType<AMapRuntime["Polyline"]> | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(amapKey ? "loading" : "missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [destResult, setDestResult] = useState<SearchResult | null>(null);
  const [destDistance, setDestDistance] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  // Initialize map
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
      mapRef.current = { map, amap: AMap };
      setState("ready");
    }).catch(() => !disposed && setState("error"));
    return () => {
      disposed = true;
      map?.destroy();
      mapRef.current = null;
    };
  }, [center, venues, selectedVenueId, onSelectVenue, onPickLocation]);

  // Autocomplete search via direct JSONP (bypasses JS API plugin parsing bug)
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const pois = await jsonpPlaceSearch(keyword);
      const results: SearchResult[] = pois.map(poi => {
        const [lngStr, latStr] = (poi.location || "0,0").split(",");
        return {
          name: poi.name,
          address: [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join(" · "),
          lat: Number(latStr),
          lng: Number(lngStr),
        };
      }).filter(item => item.lat && item.lng);
      setSuggestions(results);
      setShowSuggest(true);
    } catch {
      setSuggestions([]);
      setShowSuggest(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    const timer = window.setTimeout(() => doSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery, doSearch]);

  // Select a destination
  const selectDestination = useCallback((result: SearchResult) => {
    if (!mapRef.current) return;
    const { map, amap } = mapRef.current;

    // Remove old destination marker and polyline
    if (destMarkerRef.current) {
      map.remove(destMarkerRef.current);
      destMarkerRef.current = null;
    }
    if (polylineRef.current) {
      map.remove(polylineRef.current);
      polylineRef.current = null;
    }

    // Add new destination marker
    const destMarker = new amap.Marker({
      position: [result.lng, result.lat],
      content: makeDestMarkerContent(result.name),
      offset: new amap.Pixel(-18, -40),
      zIndex: 130,
    });
    map.add(destMarker);
    destMarkerRef.current = destMarker;

    // Draw polyline from user to destination
    const line = new amap.Polyline({
      path: [[center.lng, center.lat], [result.lng, result.lat]],
      strokeColor: "#ff5a1f",
      strokeWeight: 3,
      strokeOpacity: 0.8,
      strokeStyle: "dashed",
      showDir: true,
    });
    map.add(line);
    polylineRef.current = line;

    // Fit view to show both points
    map.setFitView([destMarker], false, [120, 200, 120, 200]);

    // Calculate distance
    const distKm = haversineKm(
      { lat: center.lat, lng: center.lng },
      { lat: result.lat, lng: result.lng },
    );
    setDestDistance(distKm);
    setDestResult(result);
    setShowSuggest(false);
    setSearchQuery(result.name);
  }, [center]);

  // Clear destination
  const clearDestination = useCallback(() => {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    if (destMarkerRef.current) {
      map.remove(destMarkerRef.current);
      destMarkerRef.current = null;
    }
    if (polylineRef.current) {
      map.remove(polylineRef.current);
      polylineRef.current = null;
    }
    setDestResult(null);
    setDestDistance(null);
    setSearchQuery("");
    setShowSuggest(false);
  }, []);

  // Build navigation URL
  const navUrl = destResult
    ? buildAmapNavigationUrl(
        { name: destResult.name, coordinate: { lat: destResult.lat, lng: destResult.lng, label: destResult.name } },
        "walk",
      )
    : null;

  if (state === "missing") return <div className={`amap-fallback ${compact ? "compact" : ""}`}>
    <div><span>高</span><div><b>高德地图接口已接入，等待配置 Key</b><p>配置后即可在此点选位置，并在成局后查看场馆标记。</p></div></div>
    <small>需要 Web端（JS API）Key 与安全密钥</small>
  </div>;

  return <div className={`amap-shell ${compact ? "compact" : ""} amap-search-enabled`}>
    {/* Search overlay */}
    <div className="amap-search-overlay">
      <div className="amap-search-box">
        <span className="amap-search-icon">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setShowSuggest(true); }}
          onFocus={() => { if (suggestions.length) setShowSuggest(true); }}
          placeholder="搜索想去的地方…"
          aria-label="搜索地点"
        />
        {searchQuery && <button className="amap-search-clear" onClick={clearDestination} aria-label="清除">×</button>}
        {searching && <span className="amap-search-loading">搜索中…</span>}
      </div>
      {showSuggest && suggestions.length > 0 && (
        <div className="amap-suggest-list">
          {suggestions.map((item, i) => (
            <button key={`${item.name}-${i}`} className="amap-suggest-item" onClick={() => selectDestination(item)}>
              <b>{item.name}</b>
              <small>{item.address}</small>
            </button>
          ))}
        </div>
      )}
      {showSuggest && suggestions.length === 0 && !searching && searchQuery.trim() && (
        <div className="amap-suggest-list">
          <div className="amap-suggest-empty">没有找到相关地点，换个关键词试试</div>
        </div>
      )}
    </div>

    <div ref={containerRef} className="amap-container" aria-label="高德地图选址" />
    {state === "loading" && <div className="amap-status">正在加载高德地图…</div>}
    {state === "error" && <div className="amap-status error">地图加载失败，请检查 Key、白名单和安全密钥</div>}

    {/* Destination info panel */}
    {destResult && (
      <div className="amap-dest-panel">
        <div className="amap-dest-info">
          <b>{destResult.name}</b>
          {destResult.address && <small>{destResult.address}</small>}
          {destDistance !== null && (
            <span className="amap-dest-distance">
              距出发点约 {destDistance < 1 ? `${Math.round(destDistance * 1000)} 米` : `${destDistance.toFixed(2)} 公里`}
            </span>
          )}
        </div>
        {navUrl && (
          <a className="amap-dest-nav" href={navUrl} target="_blank" rel="noreferrer">
            去高德导航 →
          </a>
        )}
        <button className="amap-dest-close" onClick={clearDestination} aria-label="关闭">收起</button>
      </div>
    )}

    <div className="amap-brand"><span>高德地图</span><small>{onPickLocation ? "点击地图更新大致位置" : "点击场馆标记切换选择"}</small></div>
  </div>;
}
