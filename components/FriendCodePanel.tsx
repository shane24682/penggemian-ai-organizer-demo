"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "../lib/vendor/qrcode/index.js";
import QRErrorCorrectLevel from "../lib/vendor/qrcode/QRErrorCorrectLevel.js";
import { buildFriendPayload, makeFriendCode, parseFriendPayload } from "../lib/friend-code";
import Icon from "./Icon";

type Props = {
  userId: string;
  nickname: string;
  onBack: () => void;
  onScanned: (userId: string) => void;
  onNotify: (message: string) => void;
};

function QrCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const qr = new QRCode(0, QRErrorCorrectLevel.M);
    qr.addData(value);
    qr.make();
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const count = qr.getModuleCount();
    const quiet = 4;
    const scale = 7;
    canvas.width = canvas.height = (count + quiet * 2) * scale;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#151513";
    for (let row = 0; row < count; row += 1) for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) context.fillRect((column + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }, [value]);
  return <canvas ref={ref} aria-label="包含好友ID和校验码的二维码"/>;
}

export default function FriendCodePanel({ userId, nickname, onBack, onScanned, onNotify }: Props) {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [scanState, setScanState] = useState("将好友码放进取景框");
  const videoRef = useRef<HTMLVideoElement>(null);
  const payload = useMemo(() => buildFriendPayload(userId, typeof window === "undefined" ? "https://penggemian.com/" : window.location.origin + "/"), [userId]);
  const friendCode = useMemo(() => makeFriendCode(userId), [userId]);

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const start = async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (!Detector) {
          setScanState("当前浏览器暂不支持摄像头识别，请使用系统相机扫码或输入好友码");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["qr_code"] });
        const inspect = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const parsed = codes[0] && parseFriendPayload(codes[0].rawValue);
            if (parsed?.userId) {
              onScanned(parsed.userId);
              setScanning(false);
              onNotify("好友码校验通过，已打开添加好友页");
              return;
            }
          } catch { /* keep scanning */ }
          timer = window.setTimeout(inspect, 260);
        };
        inspect();
      } catch {
        setScanState("无法打开摄像头，请检查浏览器权限或使用系统相机扫码");
      }
    };
    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [onNotify, onScanned, scanning]);

  const submitManual = () => {
    const parsed = parseFriendPayload(manualCode);
    if (parsed?.userId) onScanned(parsed.userId);
    else onNotify("好友码格式或校验位不正确");
  };

  return <div className="friend-code-view">
    <div className="friend-code-head"><button onClick={onBack}><Icon name="arrow-left" size="sm"/>返回我的</button><div><span>MY FRIEND CODE</span><h2>我的好友码</h2></div><button onClick={()=>setScanning(true)}><Icon name="qr-code" size="sm"/>扫一扫</button></div>
    <div className="friend-code-stage">
      <div className="friend-code-card"><span className="friend-code-avatar">Y</span><h2>{nickname}</h2><p>杭城大学 · 已认证学生</p><QrCanvas value={payload}/><b>{friendCode}</b><small>二维码实时编码：版本、碰个面ID与校验码<br/>扫描后先验证校验位，再进入好友确认</small></div>
      <aside><h3>不是一张二维码图片</h3><p>每次打开都由代码把你的用户ID生成标准二维码；扫码端读取内容并验证好友码，校验通过后才允许发起好友申请。</p><div><span>01</span><b>编码用户ID</b></div><div><span>02</span><b>生成防误码校验位</b></div><div><span>03</span><b>扫码解析并确认好友</b></div><button onClick={async()=>{await navigator.clipboard.writeText(friendCode);onNotify("好友码已复制")}}>复制好友码</button><button onClick={async()=>{await navigator.clipboard.writeText(payload);onNotify("好友链接已复制")}}>复制好友链接</button></aside>
    </div>
    {scanning && <div className="scan-layer" role="dialog" aria-modal="true"><div className="scan-modal"><button aria-label="关闭扫码" onClick={()=>setScanning(false)}><Icon name="x" size="sm"/></button><span>SCAN FRIEND QR</span><h2>扫描碰个面好友码</h2><div className="camera-frame"><video ref={videoRef} playsInline muted/><i/><i/><i/><i/></div><p>{scanState}</p><div className="manual-friend-code"><input value={manualCode} onChange={event=>setManualCode(event.target.value)} placeholder="也可以粘贴好友链接"/><button onClick={submitManual}>校验并添加</button></div><small>摄像头画面只在本机用于二维码识别，不会上传。</small></div></div>}
  </div>;
}
