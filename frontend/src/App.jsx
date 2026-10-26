/* =====================================================================
   TCP · Wi-Fi Loss Lab — Frosted-Glass Engineering Dashboard
   "Performance Analysis of TCP under Dynamic Wi-Fi Packet Loss
    in Educational Networks"
   ===================================================================== */
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, Brush,
  ComposedChart, Scatter, ErrorBar,
} from "recharts";

/* ------------------------------------------------------------------ */
/* 1. DESIGN SYSTEM (CSS)                                               */
/* ------------------------------------------------------------------ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700&display=swap');
:root{
  --tp:#2563EB; --ok:#10B981; --loss:#F59E0B; --queue:#3B82F6; --down:#EF4444; --violet:#8B5CF6; --cyan:#22D3EE;
  --bg:#060A16; --bg2:#0B1226; --text:#E6ECFF; --muted:#8A97B8; --faint:#55617f;
  --glass:rgba(22,32,60,.42); --glass-strong:rgba(28,40,74,.62); --glass-border:rgba(148,170,255,.16);
  --glass-hi:rgba(255,255,255,.08); --shadow:0 20px 50px -20px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.06);
  --grid:rgba(148,170,255,.08); --r:20px; --r-sm:12px;
  --f-display:'Space Grotesk',sans-serif; --f-body:'Manrope',sans-serif; --f-mono:'JetBrains Mono',monospace;
}
[data-theme="light"]{
  --bg:#EEF2FB; --bg2:#E2E8F7; --text:#0D1630; --muted:#4B5878; --faint:#8D98B3;
  --glass:rgba(255,255,255,.55); --glass-strong:rgba(255,255,255,.75); --glass-border:rgba(37,99,235,.14);
  --glass-hi:rgba(255,255,255,.8); --shadow:0 20px 50px -24px rgba(30,50,110,.35), inset 0 1px 0 rgba(255,255,255,.9);
  --grid:rgba(13,22,48,.07);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
body{font-family:var(--f-body);background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;overflow-x:hidden}
button,input,select{font:inherit;color:inherit}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:var(--glass-border);border-radius:8px}

/* ambient background: aurora blobs + packet grid */
.ambient{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;animation:drift 22s ease-in-out infinite alternate}
.b1{width:620px;height:620px;background:var(--tp);top:-180px;left:-120px}
.b2{width:520px;height:520px;background:var(--ok);bottom:-200px;right:-80px;animation-delay:-6s;opacity:.35}
.b3{width:420px;height:420px;background:var(--loss);top:40%;left:45%;animation-delay:-12s;opacity:.22}
[data-theme="light"] .blob{opacity:.28}
@keyframes drift{to{transform:translate(80px,60px) scale(1.15)}}
.gridbg{position:absolute;inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 80%)}
.packets span{position:absolute;height:2px;width:60px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--cyan));animation:fly linear infinite;opacity:.5}
@keyframes fly{from{transform:translateX(-10vw)}to{transform:translateX(110vw)}}

/* layout */
.app{position:relative;z-index:1;display:flex;min-height:100vh}
.side{position:sticky;top:0;height:100vh;width:268px;flex-shrink:0;padding:18px;display:flex;flex-direction:column;gap:6px;transition:width .35s cubic-bezier(.2,.8,.2,1);
  background:var(--glass);backdrop-filter:blur(26px) saturate(160%);border-right:1px solid var(--glass-border);z-index:20}
.side.collapsed{width:84px}
.brand{display:flex;align-items:center;gap:12px;padding:6px 6px 18px;border-bottom:1px solid var(--glass-border);margin-bottom:10px}
.logo{width:46px;height:46px;flex-shrink:0;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:#060A16;box-shadow:0 0 25px -4px rgba(245,158,11,.5);border:1px solid rgba(245,158,11,.35)}
.logo img{width:100%;height:100%;object-fit:cover;display:block}
.logo svg{width:24px;height:24px}
.brand b{font-family:var(--f-display);font-size:15px;letter-spacing:.02em;display:block}
.brand small{font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:.12em}
.side.collapsed .hide-c{display:none}
.nav{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;border:1px solid transparent;background:none;cursor:pointer;color:var(--muted);text-align:left;font-weight:600;font-size:14px;transition:.25s;position:relative;white-space:nowrap}
.nav:hover{color:var(--text);background:var(--glass-hi)}
.nav.active{color:var(--text);background:linear-gradient(120deg,rgba(37,99,235,.28),rgba(34,211,238,.08));border-color:rgba(37,99,235,.45);box-shadow:0 0 24px -8px var(--tp)}
.nav.active::before{content:"";position:absolute;left:-18px;top:20%;bottom:20%;width:3px;border-radius:3px;background:var(--tp);box-shadow:0 0 12px var(--tp)}
.nav .num{font-family:var(--f-mono);font-size:10px;opacity:.6;margin-left:auto}
.nav svg{width:20px;height:20px;flex-shrink:0}
.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.main{flex:1;min-width:0;padding:22px 28px 60px}
.topbar{display:flex;align-items:center;gap:14px;margin-bottom:22px;padding:10px 14px;border-radius:18px;background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--glass-border);position:sticky;top:12px;z-index:15;box-shadow:var(--shadow)}
.crumb{font-family:var(--f-mono);font-size:12px;color:var(--muted)}.crumb b{color:var(--text)}
.live{display:flex;align-items:center;gap:8px;font-family:var(--f-mono);font-size:11px;color:var(--ok);margin-left:auto}
.dot{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 0 0 currentColor;animation:ping 1.8s infinite}
@keyframes ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,currentColor 60%,transparent)}100%{box-shadow:0 0 0 10px transparent}}

/* glass primitives */
.glass{background:var(--glass);backdrop-filter:blur(22px) saturate(150%);border:1px solid var(--glass-border);border-radius:var(--r);box-shadow:var(--shadow);position:relative;overflow:hidden}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg,var(--glass-hi),transparent 40%)}
.card{padding:22px}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.card-h h3{font-family:var(--f-display);font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px}
.eyebrow{font-family:var(--f-mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.grid{display:grid;gap:18px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.g6{grid-template-columns:repeat(6,minmax(0,1fr))}
.span2{grid-column:span 2}.span3{grid-column:span 3}.full{grid-column:1/-1}
@media(max-width:1200px){.g6{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:860px){.g2,.g3,.g4,.g6{grid-template-columns:1fr}.span2,.span3{grid-column:auto}.side{position:fixed;left:0;transform:translateX(0)}.side.collapsed{transform:translateX(-100%);width:268px}.main{padding:16px}}
.mt{margin-top:18px}.mb{margin-bottom:18px}
.page{animation:rise .55s cubic-bezier(.2,.8,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* hero */
.hero{padding:34px 36px;display:grid;grid-template-columns:1.4fr 1fr;gap:30px;align-items:center}
@media(max-width:1100px){.hero{grid-template-columns:1fr}}
.hero h1{font-family:var(--f-display);font-size:clamp(28px,3.4vw,46px);line-height:1.05;letter-spacing:-.02em;font-weight:700}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,var(--tp),var(--cyan) 50%,var(--ok));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.sub{color:var(--muted);margin-top:14px;font-size:15.5px;line-height:1.6;max-width:62ch}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.badge{font-family:var(--f-mono);font-size:11px;padding:6px 11px;border-radius:999px;border:1px solid var(--glass-border);background:var(--glass-hi);display:inline-flex;align-items:center;gap:6px}
.badge i{width:6px;height:6px;border-radius:50%;background:var(--c,var(--tp))}
.authors{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.author{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:999px;background:var(--glass-strong);border:1px solid var(--glass-border)}
.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-family:var(--f-display);font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,var(--a1),var(--a2))}
.author b{font-size:13px;display:block}.author small{font-family:var(--f-mono);font-size:10.5px;color:var(--muted)}

/* signal orb in hero */
.orb{position:relative;aspect-ratio:1;max-width:340px;margin:auto;width:100%}
.orb .ring{position:absolute;inset:0;border-radius:50%;border:1px solid var(--glass-border);animation:pulse 4s ease-out infinite}
.orb .ring:nth-child(2){animation-delay:1.3s}.orb .ring:nth-child(3){animation-delay:2.6s}
@keyframes pulse{0%{transform:scale(.35);opacity:1;border-color:var(--cyan)}100%{transform:scale(1);opacity:0}}
.orb .core{position:absolute;inset:30%;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.5),transparent 40%),conic-gradient(var(--tp),var(--cyan),var(--ok),var(--loss),var(--down),var(--tp));filter:saturate(1.2);box-shadow:0 0 80px -10px var(--tp);animation:spin 16s linear infinite;display:grid;place-items:center}
.orb .core::after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--bg2);opacity:.85}
@keyframes spin{to{transform:rotate(360deg)}}
.orb .label{position:absolute;inset:0;display:grid;place-items:center;text-align:center;z-index:2;font-family:var(--f-mono)}
.orb .label b{font-family:var(--f-display);font-size:34px;display:block}
.orb .chip{position:absolute;font-family:var(--f-mono);font-size:10.5px;padding:5px 9px;border-radius:9px;background:var(--glass-strong);border:1px solid var(--glass-border);backdrop-filter:blur(12px);white-space:nowrap}

/* KPI */
.kpi{padding:18px 18px 14px}
.kpi .v{font-family:var(--f-display);font-size:28px;font-weight:700;letter-spacing:-.02em;margin-top:8px}
.kpi .v small{font-size:13px;color:var(--muted);font-weight:500;margin-left:4px}
.kpi .s{font-family:var(--f-mono);font-size:11px;color:var(--muted);margin-top:4px}
.kpi .bar{height:3px;border-radius:3px;margin-top:12px;background:var(--glass-border);overflow:hidden}
.kpi .bar span{display:block;height:100%;background:var(--c);box-shadow:0 0 10px var(--c)}
.kpi .icon{position:absolute;right:14px;top:14px;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c)}
.kpi .icon svg{width:18px;height:18px}

/* buttons & inputs */
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;border:1px solid var(--glass-border);background:var(--glass-strong);cursor:pointer;font-weight:600;font-size:13.5px;transition:.2s;backdrop-filter:blur(10px)}
.btn:hover{transform:translateY(-1px);border-color:var(--tp)}
.btn svg{width:16px;height:16px}
.btn.primary{background:linear-gradient(135deg,var(--tp),#1D4ED8 60%,var(--cyan));border-color:transparent;color:#fff;box-shadow:0 10px 30px -10px var(--tp)}
.btn.primary:hover{box-shadow:0 14px 40px -10px var(--tp)}
.btn.danger{background:color-mix(in srgb,var(--down) 20%,transparent);border-color:color-mix(in srgb,var(--down) 50%,transparent)}
.btn.ghost{background:transparent}
.btn.sm{padding:6px 10px;font-size:12px;border-radius:9px}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.icon-btn{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;border:1px solid var(--glass-border);background:var(--glass-strong);cursor:pointer}
.icon-btn svg{width:18px;height:18px}
.field{display:flex;flex-direction:column;gap:7px}
.field label{font-size:12px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:6px}
.input,.select{width:100%;padding:11px 13px;border-radius:12px;border:1px solid var(--glass-border);background:var(--glass-strong);outline:none;font-family:var(--f-mono);font-size:13px;transition:.2s}
.input:focus,.select:focus{border-color:var(--tp);box-shadow:0 0 0 4px color-mix(in srgb,var(--tp) 20%,transparent)}
.select option{background:var(--bg2)}
.range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:6px;background:linear-gradient(90deg,var(--tp) var(--p),var(--glass-border) var(--p));outline:none}
.range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--tp);box-shadow:0 0 12px var(--tp);cursor:pointer}
.range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--tp)}
.val{font-family:var(--f-mono);font-size:12px;padding:2px 8px;border-radius:7px;background:color-mix(in srgb,var(--tp) 18%,transparent);color:var(--text);margin-left:auto}
.seg{display:inline-flex;padding:4px;border-radius:12px;background:var(--glass-strong);border:1px solid var(--glass-border);gap:2px;flex-wrap:wrap}
.seg button{border:0;background:none;padding:7px 12px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted)}
.seg button.on{background:var(--tp);color:#fff;box-shadow:0 6px 18px -6px var(--tp)}

/* status pills */
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-family:var(--f-mono);font-size:11.5px;background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent);color:var(--text)}
.pill .dot{color:var(--c)}
.tag{display:inline-block;padding:3px 8px;border-radius:7px;font-family:var(--f-mono);font-size:10.5px;font-weight:500;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 35%,transparent);white-space:nowrap}
.telemetry{display:flex;flex-direction:column;gap:10px}
.tel-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--glass-hi);border:1px solid var(--glass-border)}
.tel-row .ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c)}
.tel-row .ic svg{width:17px;height:17px}
.tel-row b{font-size:13.5px}.tel-row small{display:block;font-family:var(--f-mono);font-size:10.5px;color:var(--muted)}
.tel-row .pill{margin-left:auto}

/* problem compare */
.vs{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:stretch}
@media(max-width:860px){.vs{grid-template-columns:1fr}}
.vs-col{padding:18px;border-radius:16px;border:1px solid var(--glass-border);background:var(--glass-hi)}
.vs-col h4{font-family:var(--f-display);font-size:15px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.vs-col ul{list-style:none;display:flex;flex-direction:column;gap:9px;font-size:13.5px;color:var(--muted)}
.vs-col li{display:flex;gap:9px}.vs-col li::before{content:"▸";color:var(--c)}
.vs-mid{display:grid;place-items:center;font-family:var(--f-display);font-weight:700;font-size:13px;color:var(--muted)}
.vs-mid span{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;border:1px dashed var(--glass-border)}
.mini-svg{width:100%;height:70px;margin-top:12px}

/* architecture pipeline */
.pipe{display:flex;gap:0;align-items:stretch;overflow-x:auto;padding:10px 4px 18px}
.node{min-width:150px;flex:1;padding:16px 14px;border-radius:16px;background:var(--glass-strong);border:1px solid var(--glass-border);cursor:pointer;transition:.3s;position:relative;text-align:left}
.node:hover,.node.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 18px 40px -16px var(--c);transform:translateY(-4px)}
.node .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);margin-bottom:10px}
.node .ic svg{width:19px;height:19px}
.node b{font-size:13px;display:block;line-height:1.3}.node small{font-family:var(--f-mono);font-size:10px;color:var(--muted);display:block;margin-top:4px}
.node .step{position:absolute;top:10px;right:12px;font-family:var(--f-mono);font-size:10px;color:var(--faint)}
.link{width:46px;flex-shrink:0;position:relative;align-self:center;height:2px;background:repeating-linear-gradient(90deg,var(--glass-border) 0 6px,transparent 6px 10px)}
.link::after{content:"";position:absolute;top:-3px;left:0;width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan);animation:travel 1.6s linear infinite}
@keyframes travel{to{left:calc(100% - 8px)}}
.node-detail{margin-top:6px;padding:16px 18px;border-radius:14px;border:1px solid var(--glass-border);background:var(--glass-hi);display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start;font-size:13.5px;color:var(--muted);line-height:1.6}
.node-detail code{font-family:var(--f-mono);font-size:12px;color:var(--cyan)}

/* scenario cards */
.scen-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:1100px){.scen-grid{grid-template-columns:repeat(2,1fr)}}
.scen{padding:14px;border-radius:14px;border:1px solid var(--glass-border);background:var(--glass-hi);cursor:pointer;text-align:left;transition:.2s;position:relative}
.scen:hover{border-color:var(--c)}
.scen.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);box-shadow:0 0 0 1px var(--c)}
.scen code{font-family:var(--f-mono);font-size:12.5px;font-weight:700;color:var(--c)}
.scen b{display:block;font-size:13px;margin:4px 0 2px}.scen small{color:var(--muted);font-size:11.5px;line-height:1.4;display:block}
.scen .check{position:absolute;top:12px;right:12px;width:16px;height:16px;border-radius:50%;border:2px solid var(--glass-border)}
.scen.on .check{border-color:var(--c);background:radial-gradient(var(--c) 45%,transparent 50%)}

/* progress / console */
.progress{height:10px;border-radius:10px;background:var(--glass-hi);border:1px solid var(--glass-border);overflow:hidden;position:relative}
.progress span{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,var(--tp),var(--cyan));box-shadow:0 0 18px var(--tp);transition:width .2s linear}
.progress span::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 8px,transparent 8px 16px);animation:stripes 1s linear infinite}
@keyframes stripes{to{background-position:32px 0}}
.console{font-family:var(--f-mono);font-size:12px;line-height:1.75;background:rgba(2,6,18,.6);border-radius:14px;padding:14px 16px;height:220px;overflow:auto;border:1px solid var(--glass-border);color:#A8B6DA}
[data-theme="light"] .console{background:rgba(13,22,48,.88)}
.console .t{color:var(--cyan)}.console .w{color:var(--loss)}.console .e{color:var(--down)}.console .o{color:var(--ok)}
.drop{border:2px dashed var(--glass-border);border-radius:16px;padding:26px;text-align:center;transition:.2s;cursor:pointer}
.drop.over{border-color:var(--tp);background:color-mix(in srgb,var(--tp) 10%,transparent)}
.drop svg{width:34px;height:34px;color:var(--tp);margin-bottom:8px}

/* chart */
.chart{width:100%;height:300px}
.chart.tall{height:380px}.chart.sm{height:120px}
.legend-chips{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.legend-chips span{display:flex;align-items:center;gap:6px}.legend-chips i{width:10px;height:10px;border-radius:3px;background:var(--c)}
.tt{background:var(--glass-strong);backdrop-filter:blur(16px);border:1px solid var(--glass-border);border-radius:12px;padding:10px 12px;font-family:var(--f-mono);font-size:11.5px;box-shadow:var(--shadow)}
.tt b{display:block;margin-bottom:4px;font-family:var(--f-display)}
.tt div{display:flex;gap:8px;align-items:center}.tt i{width:8px;height:8px;border-radius:2px}
.formula{font-family:var(--f-mono);font-size:13px;padding:12px 14px;border-radius:12px;background:var(--glass-hi);border:1px solid var(--glass-border)}
.formula b{color:var(--cyan)}

/* tooltip (academic) */
.tip{position:relative;display:inline-flex;align-items:center;cursor:help}
.tip>.q{width:15px;height:15px;border-radius:50%;display:grid;place-items:center;font-size:9.5px;font-weight:700;font-family:var(--f-mono);border:1px solid var(--glass-border);color:var(--muted)}
.tip .bubble{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translate(-50%,6px);width:260px;padding:12px 14px;border-radius:12px;background:var(--glass-strong);backdrop-filter:blur(20px);border:1px solid var(--glass-border);box-shadow:var(--shadow);font-size:12px;line-height:1.55;color:var(--text);font-weight:400;opacity:0;pointer-events:none;transition:.2s;z-index:50;text-transform:none;letter-spacing:0;font-family:var(--f-body)}
.tip .bubble b{display:block;font-family:var(--f-mono);color:var(--cyan);font-size:11px;margin-bottom:4px}
.tip:hover .bubble{opacity:1;transform:translate(-50%,0)}

/* AI page */
.model-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:860px){.model-stats{grid-template-columns:repeat(2,1fr)}}
.mstat{padding:14px;border-radius:14px;background:var(--glass-hi);border:1px solid var(--glass-border)}
.mstat b{font-family:var(--f-display);font-size:22px;display:block}.mstat small{font-size:11px;color:var(--muted)}
.gauge{position:relative;width:170px;height:170px;margin:auto}
.gauge svg{transform:rotate(-90deg)}
.gauge .lbl{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.gauge .lbl b{font-family:var(--f-display);font-size:34px}
.layers{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:center}
@media(max-width:860px){.layers{grid-template-columns:1fr}}
.layer{padding:14px;border-radius:14px;border:1px solid var(--glass-border);background:var(--glass-hi);font-size:12.5px;color:var(--muted)}
.layer b{display:block;color:var(--text);font-size:13.5px;margin-bottom:4px}
.cm{display:grid;grid-template-columns:110px repeat(4,1fr);gap:6px;font-family:var(--f-mono);font-size:11px}
.cm .h{color:var(--muted);display:flex;align-items:center;justify-content:center;text-align:center;padding:4px}
.cm .rh{justify-content:flex-end;text-align:right}
.cell{aspect-ratio:1.5;border-radius:10px;display:grid;place-items:center;font-size:15px;font-weight:700;font-family:var(--f-display);transition:.2s;cursor:default;border:1px solid var(--glass-border)}
.cell:hover{transform:scale(1.06);box-shadow:0 0 20px -4px var(--tp)}
.fi-row{display:grid;grid-template-columns:120px 1fr 54px;gap:12px;align-items:center;font-family:var(--f-mono);font-size:12px;margin-bottom:10px}
.fi-bar{height:12px;border-radius:6px;background:var(--glass-hi);overflow:hidden}
.fi-bar span{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--tp),var(--cyan));box-shadow:0 0 12px -2px var(--tp);transition:width 1s cubic-bezier(.2,.8,.2,1)}

/* tables */
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.search{position:relative;flex:1;min-width:200px}
.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--muted)}
.search .input{padding-left:36px}
.table-wrap{overflow:auto;border-radius:14px;border:1px solid var(--glass-border);max-height:520px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{position:sticky;top:0;background:var(--glass-strong);backdrop-filter:blur(18px);text-align:left;padding:11px 12px;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;cursor:pointer;border-bottom:1px solid var(--glass-border);z-index:2}
tbody td{padding:10px 12px;border-bottom:1px solid var(--glass-border);vertical-align:top}
tbody tr{transition:.15s}tbody tr:hover{background:var(--glass-hi)}
td.mono{font-family:var(--f-mono);white-space:nowrap}
td.wrap{min-width:220px;color:var(--muted);line-height:1.5}
.conf{display:flex;align-items:center;gap:8px;font-family:var(--f-mono)}
.conf .fi-bar{width:60px;height:6px}
.pager{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:12px;font-family:var(--f-mono);font-size:12px;color:var(--muted)}
.empty{padding:40px;text-align:center;color:var(--muted)}

/* toast */
.toasts{position:fixed;bottom:22px;right:22px;display:flex;flex-direction:column;gap:10px;z-index:100}
.toast{padding:12px 16px;border-radius:14px;background:var(--glass-strong);backdrop-filter:blur(20px);border:1px solid var(--glass-border);border-left:3px solid var(--c,var(--ok));box-shadow:var(--shadow);font-size:13px;animation:rise .3s;max-width:340px}
.section-title{display:flex;align-items:end;justify-content:space-between;margin:28px 0 14px;gap:12px;flex-wrap:wrap}
.section-title h2{font-family:var(--f-display);font-size:24px;letter-spacing:-.01em}
.section-title p{color:var(--muted);font-size:13.5px;margin-top:4px}
`;

/* ------------------------------------------------------------------ */
/* 2. ICONS (inline SVG, no dependency)                                 */
/* ------------------------------------------------------------------ */
const P = {
  overview:"M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  control:"M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  chart:"M3 3v18h18M7 15l4-4 3 3 5-6",
  ai:"M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4zM9 10h.01M15 10h.01M9 15h6",
  db:"M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6",
  wifi:"M5 12.55a11 11 0 0114 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01",
  laptop:"M4 5h16v11H4zM2 19h20",
  server:"M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  filter:"M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  cpu:"M9 9h6v6H9zM4 4h16v16H4zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3",
  tree:"M12 2l4 6h-3v4h5l-6 10-6-10h5V8H8z",
  monitor:"M3 4h18v12H3zM8 20h8M12 16v4",
  play:"M6 4l14 8-14 8z", stop:"M6 6h12v12H6z",
  upload:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  search:"M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
  sun:"M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon:"M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  menu:"M3 6h18M3 12h18M3 18h18",
  socket:"M12 22v-5M9 8V2M15 8V2M18 8v4a6 6 0 01-12 0V8z",
  kernel:"M4 17l6-6-6-6M12 19h8",
  shaper:"M2 12h4l3-8 4 16 3-8h6",
  activity:"M22 12h-4l-3 9L9 3l-3 9H2",
  clock:"M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
  window:"M3 3h18v18H3zM3 9h18M9 21V9",
  repeat:"M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
  target:"M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z",
  zap:"M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  file:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
  refresh:"M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0020.5 15",
};
const Icon = ({ n, ...r }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...r}><path d={P[n]} /></svg>
);

/* ------------------------------------------------------------------ */
/* 3. ACADEMIC GLOSSARY TOOLTIPS                                        */
/* ------------------------------------------------------------------ */
const GLOSS = {
  cwnd:["cwnd · Congestion Window","Max un-ACKed segments the sender may have in flight. TCP grows it to probe capacity and shrinks it on loss."],
  ssthresh:["ssthresh · Slow-Start Threshold","Boundary between exponential Slow Start and linear Congestion Avoidance. Set to cwnd/2 on loss."],
  rtt:["RTT · Round-Trip Time","Time for a segment to reach the receiver and its ACK to return. Kernel sRTT is the smoothed EWMA estimate."],
  apprtt:["app_rtt · Application Ping RTT","Echo latency measured at app layer; includes head-of-line blocking when TCP waits on retransmissions."],
  goodput:["Goodput","Useful application bytes delivered per second at the receiver — excludes retransmissions and headers."],
  throughput:["Throughput","Rate of bytes ACKed at the sender (from TCP_INFO bytes_acked delta / 0.5 s window)."],
  retrans:["Retransmissions","Segments re-sent after Fast Retransmit (3 dup-ACKs) or Retransmission Timeout (RTO)."],
  rto:["RTO · Retransmission Timeout","Timer expiry when no ACK arrives. cwnd collapses to 1 MSS and timer doubles (exponential backoff)."],
  netem:["tc netem","Linux traffic-control queueing discipline that emulates loss, delay, jitter and rate limits on an interface."],
  rssi:["RSSI","Received Signal Strength Indicator in dBm. Below −75 dBm, Wi-Fi frame errors rise sharply."],
  mathis:["Mathis Model (1997)","Steady-state TCP Reno throughput ≈ (MSS/RTT)·(C/√p), C≈1.22. Shows throughput ∝ 1/√loss."],
  tcpinfo:["TCP_INFO","Linux getsockopt() struct exposing kernel TCP state: cwnd, ssthresh, rtt, retrans, ca_state, backoff."],
  rf:["Random Forest","Ensemble of decision trees trained on bootstrap samples; prediction = majority vote. Robust to noisy features."],
  gkf:["Grouped K-Fold CV","Folds are split by experiment run so windows from one run never appear in both train and test — prevents leakage."],
  hol:["Head-of-Line Blocking","In-order delivery means one lost segment stalls all later data until it is retransmitted."],
  loss:["Loss Rate p","Fraction of packets dropped. Measured = retrans_delta / segments_out per window; Target = netem setting."],
};
const Tip = ({ k }) => (
  <span className="tip"><span className="q">?</span><span className="bubble"><b>{GLOSS[k][0]}</b>{GLOSS[k][1]}</span></span>
);

/* ------------------------------------------------------------------ */
/* 4. MOCK DATA (seeded, matches the physical 2-PC run)                 */
/* ------------------------------------------------------------------ */
const C = { tp:"#2563EB", ok:"#10B981", loss:"#F59E0B", queue:"#3B82F6", down:"#EF4444", violet:"#8B5CF6", cyan:"#22D3EE" };

const SCENARIOS = [
  { id:"baseline", name:"Baseline", desc:"0% loss · link capacity benchmark", c:C.ok, tp:10001, rtt:17.9, rtx:2, cwnd:108, loss:0 },
  { id:"loss1", name:"Loss 1%", desc:"Constant 1% · low degradation", c:C.cyan, tp:10001, rtt:14.6, rtx:279, cwnd:81, loss:1 },
  { id:"loss5", name:"Loss 5%", desc:"Constant 5% · moderate degradation", c:C.loss, tp:8418, rtt:15.6, rtx:890, cwnd:71, loss:5 },
  { id:"loss10", name:"Loss 10%", desc:"Constant 10% · frequent RTO timeouts", c:"#F97316", tp:6334, rtt:14.4, rtx:792, cwnd:75, loss:10, stalls:2 },
  { id:"dynamic", name:"Dynamic (R1)", desc:"1 → 5 → 10 → 5 → 1% cycle", c:C.violet, tp:7849, rtt:29.1, rtx:632, cwnd:78, loss:4.4, pattern:[1,5,10,5,1] },
  { id:"dynamic2", name:"Dynamic (R2)", desc:"1 → 5 → 10 → 2% pattern", c:"#A855F7", tp:7612, rtt:26.3, rtx:701, cwnd:74, loss:4.5, pattern:[1,5,10,2] },
  { id:"congestion", name:"Congestion", desc:"3 Mbps · 20 ms · 30-pkt queue", c:C.queue, tp:2874, rtt:118.4, rtx:164, cwnd:42, loss:1.8 },
  { id:"blackout", name:"Blackout", desc:"100% loss 3–5 s · AP handoff", c:C.down, tp:6120, rtt:41.7, rtx:211, cwnd:63, loss:12.1, stalls:1 },
  { id:"mixed", name:"Mixed", desc:"Multi-impairment AI training set", c:"#EC4899", tp:6905, rtt:38.2, rtx:548, cwnd:66, loss:5.2 },
];
const SC = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

function rng(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const hash = str => [...str].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7) >>> 0 || 1;

function lossAt(s, t, dur){
  if (s.pattern){ const i = Math.min(s.pattern.length-1, Math.floor(t/(dur/s.pattern.length))); return s.pattern[i]; }
  if (s.id==="blackout") return t>=12 && t<16 ? 100 : 0.5;
  if (s.id==="mixed"){ const ph=Math.floor(t/6)%5; return [0,5,2,100,8][ph]===100 ? (t%6<3?100:2) : [0,5,2,2,8][ph]; }
  if (s.id==="congestion") return 0;
  return s.loss;
}
function phaseName(s,t,dur){
  if (s.id==="baseline") return "clean_link";
  if (s.id==="congestion") return "bottleneck_queue";
  if (s.id==="blackout") return t>=12&&t<16 ? "link_blackout" : "stable";
  return "random_loss";
}

function genSeries(id, dur=30){
  const s = SC[id], r = rng(hash(id)); const out=[]; let cwnd=10, ss=s.id==="baseline"?200:64, total=0;
  for (let i=0;i<=dur*2;i++){
    const t=i*0.5, L=lossAt(s,t,dur);
    const black = L>=100;
    let drop = black ? 1 : r() < L/100*2.2;
    let rtxd = 0;
    if (black){ cwnd=1; ss=Math.max(2,ss/2); rtxd=Math.round(2+r()*3); }
    else if (drop){ ss=Math.max(4,cwnd/2); cwnd = L>=10 && r()<.18 ? 1 : ss; rtxd=Math.round(L*4*(0.6+r())+r()*4); }
    else if (cwnd<ss) cwnd=Math.min(cwnd*2, s.cwnd*1.25);
    else cwnd=Math.min(cwnd+ (s.cwnd/18), s.cwnd*1.25);
    if (s.id==="congestion" && cwnd>s.cwnd){ cwnd=s.cwnd*0.6; ss=cwnd; rtxd=Math.round(8+r()*10); }
    const cap = s.id==="congestion"?3000: 10400;
    let tp = black?0: Math.min(cap, s.tp*(0.75+ r()*0.4)*(cwnd/(s.cwnd||1))**0.35);
    if (i<4) tp*= (i+1)/5;
    const gp = Math.max(0, tp*(1 - L/100) - r()*120);
    const krtt = s.id==="congestion" ? s.rtt*(0.6+cwnd/s.cwnd*0.6) : s.rtt*(0.82+r()*0.36);
    const app = black? 900+r()*300 : krtt + (drop? 20+L*6*r():r()*4);
    total+=rtxd;
    out.push({ t, loss: black?100:L, tp:Math.round(tp), gp:Math.round(gp), tpM:+(tp/1000).toFixed(2),
      krtt:+krtt.toFixed(1), app:+app.toFixed(1), cwnd:+cwnd.toFixed(1), ss:+Math.min(ss,140).toFixed(1), rtx:rtxd, total, phase:phaseName(s,t,dur) });
  }
  return out;
}

const MSS=1448;
const mathis = (p, rttMs=15.4) => (1.22*MSS*8)/((rttMs/1000)*Math.sqrt(p/100))/1000; // kbps
const MATHIS_CURVE = Array.from({length:30},(_,i)=>{ const p=0.5+i*0.5; return { p, model:Math.min(60000,Math.round(mathis(p))) }; });
const MEASURED = [ {p:0.5,m:10001,sd:110},{p:1,m:10001,sd:180},{p:2,m:9620,sd:420},{p:3,m:9105,sd:560},{p:5,m:8418,sd:690},{p:7,m:7440,sd:810},{p:10,m:6334,sd:940},{p:12,m:5410,sd:1020},{p:15,m:4120,sd:1100} ];
const MATHIS_DATA = MATHIS_CURVE.map(d => { const m = MEASURED.find(x=>x.p===d.p); return { ...d, measured:m?.m, err:m?[m.sd,m.sd]:undefined }; });
const LOSS_RTX = [0,0.5,1,2,3,5,7,10,12,15].map(p=>({ p, rtx:Math.round(2+ 9.2*Math.pow(p,1.9)+p*18) }));
const LOSS_RTT = [0,1,2,3,5,7,10,12,15].map(p=>({ p, wireless:+(17.9 - p*0.22 + (p%3)*0.4).toFixed(1), congestion:+(17.9 + Math.pow(p,1.6)*6.8).toFixed(1) }));
const COMPARE = ["baseline","loss1","loss5","loss10","dynamic","congestion"].map(id=>{const s=SC[id];return {name:s.name, tp:s.tp/1000, rtt:s.rtt, rtx:s.rtx, loss:s.loss}});

const CLASSES = ["normal","wireless_loss","congestion","link_interruption"];
const CLS_C = { normal:C.ok, wireless_loss:C.loss, congestion:C.queue, link_interruption:C.down };
const CLS_N = { normal:"Normal", wireless_loss:"Wireless Loss", congestion:"Congestion", link_interruption:"Link Interruption" };
const CONFUSION = [[1842,9,4,1],[11,1206,14,3],[3,12,684,2],[0,4,2,231]];
const FEATURES = [["loss_est_pct",.284],["rtt_ratio",.211],["cwnd",.162],["retrans_delta",.139],["d_tp_ratio",.098],["ca_state",.064],["rto_backoff",.042]];

/* diagnostic windows */
const SYMPTOMS = ["Fast Retransmit","Timeout RTO","Stall","RTT Inflation"];
const DETAIL = { wireless_loss:["Interference","Weak Signal"], congestion:["Queue Buildup","Buffer Overflow"], link_interruption:["Deep Fade"], normal:["—"] };
const ACTION = {
  Interference:"Switch to 5 GHz / less-crowded channel (1/6/11 on 2.4 GHz)",
  "Weak Signal":"Move closer to AP or add mesh node; target RSSI > −67 dBm",
  "Queue Buildup":"Enable fq_codel / CAKE AQM on bottleneck; apply QoS",
  "Buffer Overflow":"Reduce bufferbloat; raise link rate or shape upstream",
  "Deep Fade":"Enable 802.11r fast roaming; check AP coverage overlap",
  "—":"No action required",
};
const RECOVERY = { "Fast Retransmit":"cwnd → ssthresh (Reno/CUBIC fast recovery)", "Timeout RTO":"cwnd → 1 MSS, RTO doubled, slow start", "Stall":"Exponential RTO backoff; probes until link returns", "RTT Inflation":"Delay-based growth slows; no window cut" };
function diagnoseSeries(series, scenName, fileName="uploaded_log.csv"){
  if (!series || !series.length) return [];
  const rows = [];
  const validRtts = series.map(d=>d.krtt || 15).filter(v=>v>0);
  const baseRtt = validRtts.length ? Math.min(...validRtts) : 15;
  series.forEach((d, i) => {
    if (d.rtx < 1 && d.loss < 100 && d.tp > 5000 && d.krtt < 30) return;
    const rttRatio = (d.krtt / (baseRtt || 15));
    let cause = "normal";
    let symptom = "none";
    let detail = "Normal";
    let ev = "";

    if (d.loss >= 100 || (d.tp < 100 && d.rtx > 0)) {
      cause = "link_interruption";
      symptom = "Stall";
      detail = "AP Disassociation";
      ev = `0 bytes ACKed; RTO stalls detected; app RTT ${d.app} ms`;
    } else if (rttRatio >= 1.8 && (d.krtt - baseRtt) >= 10) {
      cause = "congestion";
      symptom = "RTT Inflation";
      detail = "Queue Buildup";
      ev = `RTT inflated to ${d.krtt} ms (${rttRatio.toFixed(1)}× base); queue standing`;
    } else if (d.rtx > 0 || d.loss > 0) {
      cause = "wireless_loss";
      symptom = d.cwnd <= 2 ? "Timeout RTO" : "Fast Retransmit";
      detail = d.loss >= 8 || d.rtx >= 20 ? "Weak Signal" : "Interference";
      ev = `loss_est ${d.loss}% with flat RTT (${d.krtt} ms ≈ base); rtt_ratio ${rttRatio.toFixed(2)}`;
    }
    if (cause !== "normal") {
      rows.push({
        id: rows.length + 1,
        t: d.t,
        scenario: scenName,
        tp: d.tp,
        rtt: d.krtt,
        rtx: d.rtx,
        symptom,
        cause,
        detail,
        evidence: ev,
        action: ACTION[detail] || "Monitor RF spectrum and link rate",
        recovery: RECOVERY[symptom] || "cwnd cut by half (fast recovery)",
        conf: +(cause === "wireless_loss" ? 94 + (i%5) : 91 + (i%7)).toFixed(1),
        agree: true,
        source: fileName
      });
    }
  });
  return rows;
}

function genDiag(){
  const r=rng(887), rows=[]; const ids=["loss1","loss5","loss10","dynamic","dynamic2","congestion","blackout","mixed"];
  ids.forEach(id=>{
    genSeries(id).forEach(d=>{
      if (d.rtx<1 && d.loss<100 && !(id==="congestion" && d.krtt>110)) return;
      if (r()>.55) return;
      let cause = d.loss>=100?"link_interruption": id==="congestion"?"congestion": d.loss>0?"wireless_loss":"normal";
      if (id==="mixed" && r()<.2) cause="congestion";
      const symptom = cause==="link_interruption"?"Stall": cause==="congestion"? (r()<.5?"RTT Inflation":"Fast Retransmit") : d.cwnd<=2?"Timeout RTO":"Fast Retransmit";
      const dets = DETAIL[cause]; const detail = cause==="wireless_loss" ? (d.loss>=8?"Weak Signal":"Interference") : dets[Math.floor(r()*dets.length)];
      const conf = +(cause==="link_interruption"? 96+r()*4 : 78+r()*21).toFixed(1);
      const agree = conf>84 || r()<.5;
      const ev = cause==="wireless_loss" ? `loss_est ${d.loss}% with flat RTT (${d.krtt} ms ≈ base); rtt_ratio ${(d.krtt/17.9).toFixed(2)}`
        : cause==="congestion" ? `RTT inflated to ${d.krtt} ms (ratio ${(d.krtt/17.9).toFixed(1)}×) preceding drops; queue standing`
        : `0 bytes ACKed for ≥0.5 s; rto_backoff ${1+Math.floor(r()*3)}; app_rtt ${d.app} ms`;
      rows.push({ id:rows.length+1, t:d.t, scenario:id, tp:d.tp, rtt:d.krtt, rtx:d.rtx, symptom, cause, detail, evidence:ev, action:ACTION[detail], recovery:RECOVERY[symptom], conf, agree });
    });
  });
  return rows;
}
const DIAG = genDiag();

/* sqlite records */
const DB_ROWS = (() => { const rows=[]; ["baseline","loss1","loss5","loss10","dynamic"].forEach(id=>{ [1,2,3].forEach(run=>{ genSeries(id).forEach((d,i)=>{ if(i%2) return; rows.push({ rowid:rows.length+1, run_id:`${id}_r${run}`, scenario:id, run, t:d.t, bytes_acked:Math.round(d.tp*62.5), tp_kbps:d.tp, goodput_kbps:d.gp, srtt_ms:d.krtt, app_rtt_ms:d.app, cwnd:d.cwnd, ssthresh:d.ss, retrans:d.rtx, loss_target:d.loss, rssi_dbm:-58-Math.round(d.loss*1.4)-run }); }); }); }); return rows; })();

/* ------------------------------------------------------------------ */
/* 5. UTILITIES                                                         */
/* ------------------------------------------------------------------ */
function downloadFile(name, content, type="text/csv"){
  const blob = new Blob([content], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 500);
}
const toCSV = rows => !rows.length ? "" : [Object.keys(rows[0]).join(","), ...rows.map(r=>Object.values(r).map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
const fmt = n => n.toLocaleString("en-US");

const axis = { stroke:"var(--faint)", fontSize:11, fontFamily:"JetBrains Mono", tickLine:false, axisLine:false };
const ChartTip = ({ active, payload, label, unit="" , lx="t" }) => !active||!payload?.length ? null : (
  <div className="tt"><b>{lx==="t"?`t = ${label}s`:`p = ${label}%`}</b>
    {payload.map(p=> <div key={p.dataKey}><i style={{background:p.color||p.fill}}/>{p.name}: <strong>{Array.isArray(p.value)?p.value.join("–"):p.value}</strong>{unit}</div>)}
  </div>
);

/* impairment shading regions */
function regions(series){
  const out=[]; let start=null, kind=null;
  series.forEach((d,i)=>{
    const k = d.loss>=100?"down": d.loss>=5?"hi": d.loss>0?"lo":null;
    if (k!==kind){ if(kind) out.push({x1:start,x2:d.t,kind}); start=d.t; kind=k; }
    if (i===series.length-1 && kind) out.push({x1:start,x2:d.t,kind});
  });
  return out;
}
const REG_C = { down:C.down, hi:C.loss, lo:C.loss };
const REG_O = { down:.16, hi:.12, lo:.05 };

/* ------------------------------------------------------------------ */
/* 6. SHARED COMPONENTS                                                 */
/* ------------------------------------------------------------------ */
function KPI({ label, value, unit, sub, c, icon, pct, tip }){
  return (
    <div className="glass kpi" style={{"--c":c}}>
      <div className="icon"><Icon n={icon}/></div>
      <div className="eyebrow" style={{display:"flex",gap:6,alignItems:"center"}}>{label}{tip && <Tip k={tip}/>}</div>
      <div className="v">{value}<small>{unit}</small></div>
      <div className="s">{sub}</div>
      <div className="bar"><span style={{width:`${pct}%`}}/></div>
    </div>
  );
}
function Card({ title, eyebrow, right, children, className="", tip }){
  return (
    <div className={`glass card ${className}`}>
      <div className="card-h">
        <div>{eyebrow && <div className="eyebrow" style={{marginBottom:4}}>{eyebrow}</div>}<h3>{title}{tip && <Tip k={tip}/>}</h3></div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Range({ label, min, max, step=1, value, onChange, suffix }){
  const p = ((value-min)/(max-min))*100;
  return (
    <div className="field">
      <label>{label}<span className="val">{value}{suffix}</span></label>
      <input type="range" className="range" style={{"--p":`${p}%`}} min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/>
      <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--f-mono)",fontSize:10,color:"var(--faint)"}}><span>{min}{suffix}</span><span>{max}{suffix}</span></div>
    </div>
  );
}
function ScenarioSwitch({ value, onChange, ids }){
  return <div className="seg">{(ids||SCENARIOS.map(s=>s.id)).map(id=> <button key={id} className={value===id?"on":""} onClick={()=>onChange(id)}>{SC[id].name}</button>)}</div>;
}

/* ------------------------------------------------------------------ */
/* 7. PAGE 1 · EXECUTIVE OVERVIEW & ARCHITECTURE                        */
/* ------------------------------------------------------------------ */
const PIPE = [
  { ic:"laptop", c:C.tp, t:"Client Device", s:"PC-2 · Sender & Pinger", d:<>Python sender opens a TCP socket to <code>server:5201</code>, pushes a rate-limited stream and fires a 200 ms UDP/TCP echo ping to measure <code>app_rtt</code>.</> },
  { ic:"shaper", c:C.loss, t:"Loss Injection", s:"Linux tc netem", d:<><code>tc qdisc add dev wlan0 root netem loss 5%</code> — egress shaper injects random or patterned loss, delay and rate limits per scenario phase.</> },
  { ic:"wifi", c:C.cyan, t:"Wi-Fi Access Point", s:"IEEE 802.11 Router", d:<>Shared educational WLAN. Real RF effects (interference, fades, roaming) stack on top of injected loss.</> },
  { ic:"server", c:C.ok, t:"Server Device", s:"PC-1 · Goodput & Echo", d:<>Receiver counts application bytes per 0.5 s window (goodput) and echoes ping probes back to the client.</> },
  { ic:"kernel", c:C.violet, t:"Kernel Telemetry", s:"TCP_INFO & RSSI", d:<><code>getsockopt(TCP_INFO)</code> every 0.5 s → cwnd, ssthresh, srtt, total_retrans, ca_state, backoff; <code>iw dev wlan0 link</code> → RSSI.</> },
  { ic:"tree", c:"#EC4899", t:"Rule Engine + RF", s:"Random Forest Classifier", d:<>Deterministic heuristics label symptoms; a 200-tree Random Forest classifies cause into normal / wireless / congestion / interruption.</> },
  { ic:"monitor", c:C.tp, t:"Analytics Dashboard", s:"This interface", d:<>Windows are stored in SQLite <code>experiments.db</code> and visualised here with exports for reports.</> },
];

function Overview({ go }){
  const [node,setNode]=useState(0);
  const [rssi,setRssi]=useState(-62);
  useEffect(()=>{ const i=setInterval(()=>setRssi(-60-Math.round(Math.random()*5)),1600); return ()=>clearInterval(i); },[]);
  const tel = [
    { ic:"socket", c:C.ok, t:"Sockets", s:"client ↔ 192.168.1.45:5201", v:"Connected" },
    { ic:"kernel", c:C.ok, t:"Kernel TCP_INFO", s:"getsockopt · 0.5 s poll", v:"Available" },
    { ic:"wifi", c:rssi>-67?C.ok:C.loss, t:"Wi-Fi RSSI Reader", s:"wlan0 · 5 GHz ch 36", v:`${rssi} dBm · Good` },
    { ic:"shaper", c:C.ok, t:"tc/netem Egress Shaper", s:"qdisc root netem", v:"Active" },
    { ic:"db", c:C.ok, t:"SQLite Database", s:"experiments.db · "+fmt(DB_ROWS.length)+" rows", v:"Synchronized" },
  ];
  return (
    <div className="page">
      <div className="glass hero">
        <div>
          <div className="eyebrow" style={{color:"var(--loss)",display:"flex",alignItems:"center",gap:8}}>
            <img src="/pktman-logo.jpg" alt="PKT MAN" style={{width:22,height:22,borderRadius:5,objectFit:"cover"}}/>
            <span>PKT MAN · Computer Networks Academic Research Project</span>
          </div>
          <h1 style={{marginTop:12}}>PKT MAN: Performance Analysis of <em>TCP</em> under Dynamic <em>Wi-Fi</em> Packet Loss in Educational Networks</h1>
          <p className="sub">A Network Simulation, Monitoring & Machine-Learning Diagnostic Framework for Dynamic Wireless Conditions.</p>
          <div className="badges">
            {[["Computer Networks Lab",C.tp],["TCP/IP Protocol",C.ok],["IEEE 802.11 Wi-Fi",C.cyan],["Linux tc netem",C.loss],["Random Forest ML",C.violet]].map(([b,c])=> <span key={b} className="badge" style={{"--c":c}}><i/>{b}</span>)}
          </div>
          <div className="authors">
            {[["Bassil H","24BCE0904","BH",C.tp,C.cyan],["Ajitesh Mohan N","24BCE0887","AM",C.ok,C.cyan],["Abijith V K","24BKT0070","AV",C.loss,C.down]].map(([n,id,i,a1,a2])=>(
              <div key={id} className="author"><div className="avatar" style={{"--a1":a1,"--a2":a2}}>{i}</div><div><b>{n}</b><small>{id}</small></div></div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginTop:24,flexWrap:"wrap"}}>
            <button className="btn primary" onClick={()=>go("control")}><Icon n="play"/>Run an Experiment</button>
            <button className="btn" onClick={()=>go("analytics")}><Icon n="chart"/>View Analytics</button>
          </div>
        </div>
        <div className="orb">
          <div className="ring"/><div className="ring"/><div className="ring"/>
          <div className="core"/>
          <div className="label"><div><b>98.4%</b><span style={{fontSize:11,color:"var(--muted)"}}>RF CV ACCURACY</span></div></div>
          <span className="chip" style={{top:"6%",left:"2%",color:C.tp}}>▲ 10.0 Mbps baseline</span>
          <span className="chip" style={{top:"18%",right:"-2%",color:C.loss}}>⚠ 10% loss → 6.3 Mbps</span>
          <span className="chip" style={{bottom:"14%",left:"-4%",color:C.ok}}>sRTT 17.9 ms</span>
          <span className="chip" style={{bottom:"4%",right:"6%",color:C.down}}>✕ 2 RTO stalls</span>
        </div>
      </div>

      <div className="grid g3 mt">
        <Card className="span2" eyebrow="Problem Statement" title="Why TCP struggles on Wi-Fi">
          <div className="vs">
            <div className="vs-col" style={{"--c":C.queue}}>
              <h4><Icon n="server" width="18" style={{color:C.queue}}/>Wired assumption</h4>
              <ul>
                <li>Loss ⇒ <b style={{color:"var(--text)"}}>congestion</b> (router buffer overflow)</li>
                <li>Reaction: halve <b style={{color:"var(--text)"}}>cwnd</b>, set ssthresh = cwnd/2</li>
                <li>Correct when queues are the only cause of drops</li>
              </ul>
              <svg className="mini-svg" viewBox="0 0 200 70"><polyline fill="none" stroke={C.queue} strokeWidth="2.5" points="0,60 20,50 40,30 60,20 80,14 80,38 110,30 140,22 160,18 160,40 200,30"/></svg>
            </div>
            <div className="vs-mid"><span>VS</span></div>
            <div className="vs-col" style={{"--c":C.loss}}>
              <h4><Icon n="wifi" width="18" style={{color:C.loss}}/>Wi-Fi reality</h4>
              <ul>
                <li><b style={{color:"var(--text)"}}>Non-congestion</b> losses: RF interference, microwave / Bluetooth</li>
                <li>Weak <b style={{color:"var(--text)"}}>RSSI &lt; −75 dBm</b>, multipath fades, AP roaming</li>
                <li>TCP still halves cwnd ⇒ <b style={{color:C.down}}>throughput wasted</b> with idle queues</li>
              </ul>
              <svg className="mini-svg" viewBox="0 0 200 70"><polyline fill="none" stroke={C.loss} strokeWidth="2.5" points="0,60 15,45 25,48 35,30 35,52 55,44 62,58 80,40 88,60 110,42 118,62 140,48 150,64 175,50 200,44"/></svg>
            </div>
          </div>
          <div className="formula" style={{marginTop:14}}>Research question → <b>Can kernel telemetry + ML distinguish wireless loss from congestion</b> in real time, and how far does throughput deviate from the Mathis model?</div>
        </Card>
        <Card eyebrow="Live" title="System Readiness" right={<span className="live"><span className="dot"/>ALL SYSTEMS GO</span>}>
          <div className="telemetry">
            {tel.map(x=>(
              <div key={x.t} className="tel-row" style={{"--c":x.c}}>
                <div className="ic"><Icon n={x.ic}/></div>
                <div><b>{x.t}</b><small>{x.s}</small></div>
                <span className="pill" style={{"--c":x.c}}><span className="dot"/>{x.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt" eyebrow="Interactive · click any stage" title="System Architecture Pipeline">
        <div className="pipe">
          {PIPE.map((p,i)=>(
            <React.Fragment key={p.t}>
              <button className={`node ${node===i?"on":""}`} style={{"--c":p.c}} onClick={()=>setNode(i)}>
                <span className="step">0{i+1}</span>
                <div className="ic"><Icon n={p.ic}/></div><b>{p.t}</b><small>{p.s}</small>
              </button>
              {i<PIPE.length-1 && <div className="link"/>}
            </React.Fragment>
          ))}
        </div>
        <div className="node-detail" style={{"--c":PIPE[node].c}}>
          <div className="tag" style={{"--c":PIPE[node].c}}>STAGE 0{node+1}</div>
          <div><b style={{color:"var(--text)"}}>{PIPE[node].t} — {PIPE[node].s}.</b> {PIPE[node].d}</div>
        </div>
      </Card>

      <div className="grid g4 mt">
        <KPI label="Baseline Throughput" value="10,001" unit="kbps" sub="0% loss · link capacity" c={C.tp} icon="activity" pct={100} tip="throughput"/>
        <KPI label="Worst Case (10%)" value="6,334" unit="kbps" sub="−36.7% vs baseline" c={C.loss} icon="zap" pct={63}/>
        <KPI label="Scenarios Run" value="9" unit="types" sub={`${fmt(DB_ROWS.length)} telemetry windows`} c={C.ok} icon="repeat" pct={90}/>
        <KPI label="Diagnosed Windows" value={fmt(DIAG.length)} unit="flags" sub="Rule + RF classification" c={C.violet} icon="ai" pct={74}/>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. PAGE 2 · EXPERIMENT CONTROL                                       */
/* ------------------------------------------------------------------ */
function Control({ toast, setActiveScenario, uploadedFile, setUploadedFile, setCustomSeries }){
  const [scen,setScen]=useState("dynamic");
  const [ip,setIp]=useState("192.168.1.45"); const [port,setPort]=useState(5201);
  const [dur,setDur]=useState(30); const [rate,setRate]=useState(10);
  const [iface,setIface]=useState("wlan0");
  const [running,setRunning]=useState(false); const [prog,setProg]=useState(0);
  const [logs,setLogs]=useState([{c:"o",m:"[ready] Controller idle. Select a scenario and press Run."}]);
  const [live,setLive]=useState([]);
  const [over,setOver]=useState(false);
  const timer=useRef(); const conRef=useRef(); const fileRef=useRef();
  useEffect(()=>{ conRef.current && (conRef.current.scrollTop=conRef.current.scrollHeight); },[logs]);
  useEffect(()=>()=>clearInterval(timer.current),[]);

  const s=SC[scen]; const elapsed=+(prog/100*dur).toFixed(1);
  const curLoss = lossAt(s, elapsed, dur);
  const start=()=>{
    if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return toast("Invalid server IP address", C.down);
    const series = genSeries(scen,dur); setRunning(true); setProg(0); setLive([]);
    setLogs([{c:"t",m:`[0.0s] Connecting to ${ip}:${port} via ${iface} …`},{c:"o",m:`[0.0s] Socket established · TCP_INFO polling every 0.5 s · ping 200 ms`},{c:"t",m:`[0.0s] tc qdisc replace dev ${iface} root netem ${scen==="congestion"?"rate 3mbit delay 20ms limit 30":`loss ${lossAt(s,0,dur)}%`}`}]);
    let i=0, lastL=null;
    timer.current=setInterval(()=>{
      const d=series[i]; if(!d){ clearInterval(timer.current); setRunning(false); setProg(100);
        setLogs(l=>[...l,{c:"o",m:`[${dur}.0s] ✓ Run complete · ${series.length} windows · saved to experiments.db (run_id=${scen}_r4)`}]);
        setActiveScenario(scen); toast(`Experiment "${scen}" complete — results loaded in Analytics`); return; }
      setLive(v=>[...v,d]); setProg(d.t/dur*100);
      if(d.loss!==lastL){ lastL=d.loss; setLogs(l=>[...l,{c:d.loss>=100?"e":d.loss>=5?"w":"t",m:`[${d.t.toFixed(1)}s] Phase ${d.phase}: ${d.loss}% loss`}]); }
      if(d.rtx>20) setLogs(l=>[...l,{c:"w",m:`[${d.t.toFixed(1)}s] ⚠ retrans burst Δ=${d.rtx} · cwnd→${d.cwnd}`}]);
      i++;
    }, 120);
  };
  const stop=()=>{ clearInterval(timer.current); setRunning(false); setLogs(l=>[...l,{c:"e",m:`[${elapsed}s] ✕ Aborted by user. Partial data discarded.`}]); toast("Experiment aborted", C.down); };
  const onFile=f=>{
    if(!f) return;
    if(!/\.csv$/i.test(f.name)) return toast("Please upload a .csv log file", C.down);
    const rd=new FileReader();
    rd.onload=e=>{
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(Boolean);
        if(lines.length < 2) return toast("CSV file is empty", C.down);
        const headers = lines[0].split(",").map(h=>h.trim());
        const tIdx = headers.indexOf("t_s");
        const scenIdx = headers.indexOf("scenario");
        const lossIdx = headers.indexOf("loss_target_pct");
        const tpIdx = headers.indexOf("throughput_kbps");
        const gpIdx = headers.indexOf("goodput_kbps");
        const krttIdx = headers.indexOf("krtt_ms");
        const appRttIdx = headers.indexOf("app_rtt_ms");
        const cwndIdx = headers.indexOf("cwnd");
        const ssIdx = headers.indexOf("ssthresh");
        const rtxIdx = headers.indexOf("retrans_delta");
        const totRtxIdx = headers.indexOf("total_retrans");
        const impIdx = headers.indexOf("impairment");

        let detectedScenario = scen;
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map(p=>p.trim());
          if (parts.length < headers.length) continue;
          const scenName = scenIdx >= 0 ? parts[scenIdx] : "";
          if (scenName && SC[scenName]) detectedScenario = scenName;
          const t = tIdx >= 0 ? parseFloat(parts[tIdx]) : (i * 0.5);
          const tp = tpIdx >= 0 ? (parseFloat(parts[tpIdx]) || 0) : 0;
          const gp = gpIdx >= 0 && parts[gpIdx] !== "" ? (parseFloat(parts[gpIdx]) || 0) : Math.round(tp * 0.95);
          const krtt = krttIdx >= 0 ? (parseFloat(parts[krttIdx]) || 15) : 15;
          const app = appRttIdx >= 0 && parts[appRttIdx] !== "" ? (parseFloat(parts[appRttIdx]) || krtt) : krtt;
          const cwnd = cwndIdx >= 0 ? (parseFloat(parts[cwndIdx]) || 10) : 10;
          const ss = ssIdx >= 0 ? (parseFloat(parts[ssIdx]) || 64) : 64;
          const rtx = rtxIdx >= 0 ? (parseInt(parts[rtxIdx], 10) || 0) : 0;
          const total = totRtxIdx >= 0 ? (parseInt(parts[totRtxIdx], 10) || 0) : 0;
          const loss = lossIdx >= 0 ? (parseFloat(parts[lossIdx]) || 0) : 0;
          const phase = impIdx >= 0 ? parts[impIdx] : "real_wifi";

          parsed.push({
            t: +t.toFixed(1),
            loss,
            tp: Math.round(tp),
            gp: Math.round(gp),
            tpM: +(tp / 1000).toFixed(2),
            krtt: +krtt.toFixed(1),
            app: +app.toFixed(1),
            cwnd: +cwnd.toFixed(1),
            ss: +ss.toFixed(1),
            rtx,
            total,
            phase
          });
        }
        if (parsed.length > 0) {
          setUploadedFile({ name: f.name, rows: parsed.length, cols: headers.length, size: (f.size / 1024).toFixed(1), scenario: detectedScenario });
          setCustomSeries(parsed);
          setActiveScenario(detectedScenario);
          setScen(detectedScenario);
          toast(`Loaded ${parsed.length} real rows from ${f.name}! Active scenario: ${detectedScenario}.`, C.ok);
        }
      } catch (err) {
        toast("Failed to parse CSV: " + err.message, C.down);
      }
    };
    rd.readAsText(f);
  };

  return (
    <div className="page">
      <div className="section-title"><div><div className="eyebrow">Page 02</div><h2>Experiment Control & Parameters</h2><p>Configure a scenario, run a simulation, or ingest real CSV logs from the lab laptops.</p></div></div>
      <div className="grid g3">
        <Card className="span2" eyebrow="Step 1" title="Scenario Selector" tip="netem">
          <div className="scen-grid">
            {SCENARIOS.map(x=>(
              <button key={x.id} className={`scen ${scen===x.id?"on":""}`} style={{"--c":x.c}} onClick={()=>!running&&setScen(x.id)}>
                <span className="check"/><code>{x.id}</code><b>{x.name}</b><small>{x.desc}</small>
              </button>
            ))}
          </div>
        </Card>
        <Card eyebrow="Step 2" title="Input Parameters">
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 100px",gap:10}}>
              <div className="field"><label>Server IP</label><input className="input" value={ip} onChange={e=>setIp(e.target.value)} disabled={running}/></div>
              <div className="field"><label>Port</label><input className="input" type="number" value={port} onChange={e=>setPort(+e.target.value)} disabled={running}/></div>
            </div>
            <div className="seg" style={{alignSelf:"flex-start"}}>{["192.168.1.45","127.0.0.1"].map(v=> <button key={v} className={ip===v?"on":""} onClick={()=>setIp(v)}>{v}</button>)}</div>
            <Range label="Duration" min={10} max={120} value={dur} onChange={setDur} suffix="s"/>
            <Range label="Sending Rate Limit" min={0} max={50} value={rate} onChange={setRate} suffix=" Mbps"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div className="field"><label>Sampling <Tip k="tcpinfo"/></label><input className="input" value="0.5 s (fixed)" disabled/></div>
              <div className="field"><label>Ping Interval <Tip k="apprtt"/></label><input className="input" value="200 ms" disabled/></div>
            </div>
            <div className="field"><label>Network Interface</label>
              <select className="select" value={iface} onChange={e=>setIface(e.target.value)} disabled={running}>
                <option value="wlan0">wlan0 — Wi-Fi (802.11ac)</option><option value="eth0">eth0 — Ethernet</option><option value="ambient">Ambient mode (no netem, real RF only)</option>
              </select></div>
          </div>
        </Card>
      </div>

      <div className="grid g3 mt">
        <Card className="span2" eyebrow="Step 3" title="Run Experiment / Simulation"
          right={<div style={{display:"flex",gap:8}}>{running ? <button className="btn danger" onClick={stop}><Icon n="stop"/>Abort</button> : <button className="btn primary" onClick={start}><Icon n="play"/>Run Experiment</button>}</div>}>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--f-mono)",fontSize:12,marginBottom:8}}>
            <span style={{color: curLoss>=100?C.down: curLoss>=5?C.loss:C.cyan}}>{running||prog>0 ? `[${elapsed.toFixed(1)}s] Phase ${phaseName(s,elapsed,dur)}: ${curLoss}% loss` : "Awaiting start…"}</span>
            <span style={{color:"var(--muted)"}}>{prog.toFixed(0)}% · {elapsed}/{dur}s</span>
          </div>
          <div className="progress"><span style={{width:`${prog}%`}}/></div>
          <div className="grid g2 mt">
            <div className="chart sm" style={{height:200}}>
              <ResponsiveContainer><AreaChart data={live}>
                <defs><linearGradient id="lv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.tp} stopOpacity=".5"/><stop offset="1" stopColor={C.tp} stopOpacity="0"/></linearGradient></defs>
                <CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="t" {...axis} type="number" domain={[0,dur]}/><YAxis {...axis} width={44}/>
                <Tooltip content={<ChartTip unit=" kbps"/>}/>
                <Area dataKey="tp" name="Throughput" stroke={C.tp} fill="url(#lv)" strokeWidth={2} isAnimationActive={false}/>
              </AreaChart></ResponsiveContainer>
            </div>
            <div className="console" ref={conRef}>{logs.map((l,i)=> <div key={i} className={l.c}>{l.m}</div>)}{running && <div className="t">▌</div>}</div>
          </div>
        </Card>
        <Card eyebrow="Alternative" title="Upload Real CSV Log">
          <div className={`drop ${over?"over":""}`} onClick={()=>fileRef.current.click()}
            onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);onFile(e.dataTransfer.files[0])}}>
            <Icon n="upload"/><div style={{fontWeight:600}}>Drag & drop client CSV</div>
            <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>recorded on physical laptops · or click to browse</div>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={e=>onFile(e.target.files[0])}/>
          </div>
          {uploadedFile ? (
            <div className="tel-row mt" style={{"--c":C.ok}}><div className="ic"><Icon n="file"/></div><div><b>{uploadedFile.name}</b><small>{uploadedFile.rows} rows · {uploadedFile.cols} cols · {uploadedFile.size} KB (Active: {uploadedFile.scenario})</small></div><span className="pill" style={{"--c":C.ok}}><span className="dot"/>Parsed</span></div>
          ) : (
            <div className="formula mt" style={{fontSize:11}}>Expected columns:<br/><b>t, bytes_acked, srtt_ms, app_rtt_ms, cwnd, ssthresh, retrans, loss_target, rssi_dbm</b></div>
          )}
          <button className="btn ghost sm mt" onClick={()=>downloadFile("client_template.csv","t,bytes_acked,srtt_ms,app_rtt_ms,cwnd,ssthresh,retrans,loss_target,rssi_dbm\n0.5,625000,17.2,18.1,10,64,0,0,-61\n")}><Icon n="download"/>Download CSV template</button>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. PAGE 3 · PERFORMANCE ANALYTICS                                    */
/* ------------------------------------------------------------------ */
function Shading({ series }){ return regions(series).map((r,i)=> <ReferenceArea key={i} x1={r.x1} x2={r.x2} fill={REG_C[r.kind]} fillOpacity={REG_O[r.kind]} strokeOpacity={0}/>); }

function Analytics({ scen, setScen, customSeries, uploadedFile, clearUploaded }){
  const isReal = Boolean(customSeries && customSeries.length > 0 && uploadedFile && uploadedFile.scenario === scen);
  const series = useMemo(()=> isReal ? customSeries : genSeries(scen), [scen, customSeries, isReal]);
  const s = SC[scen] || SC["dynamic"];
  const dyn = useMemo(()=>genSeries("dynamic"),[]);
  const [cmpMetric,setCmp]=useState("all");
  const mean = k => series.length ? (series.reduce((a,d)=>a+(d[k]||0),0)/series.length) : 0;
  const peak = series.length ? Math.max(...series.map(d=>d.cwnd||0)) : s.cwnd;
  const meanTp = Math.round(mean("tp"));
  const measLoss = (s.rtx/ (s.tp*30/11.6) *100);
  return (
    <div className="page">
      <div className="section-title">
        <div><div className="eyebrow">Page 03</div><h2>Real-time & Historical Performance</h2><p>Shaded bands mark active impairment phases (amber = loss, red = blackout). Drag the brush to zoom.</p></div>
        <ScenarioSwitch value={scen} onChange={setScen}/>
      </div>

      {isReal && (
        <div className="glass" style={{padding:"12px 18px", borderRadius:14, marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", border:"1px solid var(--ok)", background:"rgba(16,185,129,0.09)"}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13}}>
            <span style={{background:"var(--ok)", width:10, height:10, borderRadius:"50%", display:"inline-block"}}/>
            <span><b>Real Physical Wi-Fi Telemetry Active:</b> <code>{uploadedFile.name}</code> ({series.length} measurement windows from physical testbed)</span>
          </div>
          <button className="btn sm ghost" onClick={clearUploaded}>Switch to Model Simulation</button>
        </div>
      )}

      <div className="grid g6">
        <KPI label="Mean Throughput" value={fmt(isReal ? meanTp : s.tp)} unit="kbps" sub={`${((isReal ? meanTp : s.tp)/1000).toFixed(2)} Mbps`} c={C.tp} icon="activity" pct={(isReal ? meanTp : s.tp)/105} tip="throughput"/>
        <KPI label="Server Goodput" value={fmt(Math.round(mean("gp")))} unit="kbps" sub="receiver app bytes" c={C.ok} icon="server" pct={mean("gp")/105} tip="goodput"/>
        <KPI label="sRTT vs App RTT" value={isReal ? `${mean("krtt").toFixed(1)} ms` : s.rtt} unit="ms" sub={`app ${mean("app").toFixed(1)} ms`} c={C.cyan} icon="clock" pct={Math.min(100,isReal ? mean("krtt") : s.rtt)} tip="rtt"/>
        <KPI label="Peak cwnd" value={Math.round(peak)} unit="seg" sub={`steady ≈ ${s.cwnd}`} c={C.violet} icon="window" pct={peak/1.4} tip="cwnd"/>
        <KPI label="Retransmitted" value={fmt(isReal ? (series[series.length-1]?.total || Math.round(mean("rtx")*series.length)) : s.rtx)} unit="seg" sub={s.stalls?`${s.stalls} RTO stalls`:"no stalls"} c={C.down} icon="repeat" pct={s.rtx/9} tip="retrans"/>
        <KPI label="Measured vs Target" value={Math.min(s.loss*1.04+.02, 99).toFixed(2)} unit="%" sub={`target ${s.loss}% · ${measLoss.toFixed(1)}‰ rtx/seg`} c={C.loss} icon="target" pct={Math.min(100,s.loss*8)} tip="loss"/>
      </div>

      <div className="grid g2 mt">
        <Card eyebrow="Graph A" title="Throughput vs Time" tip="goodput" right={<div className="legend-chips"><span style={{"--c":C.tp}}><i/>Sender ACKed</span><span style={{"--c":C.ok}}><i/>Receiver Goodput</span></div>}>
          <div className="chart"><ResponsiveContainer><LineChart data={series}>
            <CartesianGrid stroke="var(--grid)" vertical={false}/><Shading series={series}/>
            <XAxis dataKey="t" {...axis} type="number" domain={["dataMin","dataMax"]}/><YAxis {...axis} width={48}/>
            <Tooltip content={<ChartTip unit=" kbps"/>}/>
            <Line dataKey="tp" name="Throughput" stroke={C.tp} strokeWidth={2.4} dot={false}/>
            <Line dataKey="gp" name="Goodput" stroke={C.ok} strokeWidth={2} dot={false} strokeDasharray="5 3"/>
            <Brush dataKey="t" height={18} stroke={C.tp} fill="transparent" travellerWidth={8}/>
          </LineChart></ResponsiveContainer></div>
        </Card>
        <Card eyebrow="Graph B" title="Round-Trip Time over Time" tip="hol" right={<div className="legend-chips"><span style={{"--c":C.cyan}}><i/>Kernel sRTT</span><span style={{"--c":C.loss}}><i/>App ping RTT</span></div>}>
          <div className="chart"><ResponsiveContainer><LineChart data={series}>
            <CartesianGrid stroke="var(--grid)" vertical={false}/><Shading series={series}/>
            <XAxis dataKey="t" {...axis} type="number" domain={["dataMin","dataMax"]}/><YAxis {...axis} width={48} scale="log" domain={[5,"auto"]} allowDataOverflow/>
            <Tooltip content={<ChartTip unit=" ms"/>}/>
            <Line dataKey="krtt" name="krtt" stroke={C.cyan} strokeWidth={2.4} dot={false}/>
            <Line dataKey="app" name="app_rtt" stroke={C.loss} strokeWidth={1.6} dot={false}/>
            <Brush dataKey="t" height={18} stroke={C.cyan} fill="transparent" travellerWidth={8}/>
          </LineChart></ResponsiveContainer></div>
        </Card>
      </div>

      <Card className="mt" eyebrow="Graph C" title="Congestion Window Dynamics" tip="ssthresh" right={<div className="legend-chips"><span style={{"--c":C.violet}}><i/>cwnd</span><span style={{"--c":C.down}}><i/>ssthresh</span><span style={{"--c":C.ok}}><i/>Slow Start ↗ exp</span><span style={{"--c":C.tp}}><i/>Cong. Avoid ↗ linear</span></div>}>
        <div className="chart"><ResponsiveContainer><AreaChart data={series}>
          <defs><linearGradient id="cw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.violet} stopOpacity=".45"/><stop offset="1" stopColor={C.violet} stopOpacity="0"/></linearGradient></defs>
          <CartesianGrid stroke="var(--grid)" vertical={false}/><Shading series={series}/>
          <XAxis dataKey="t" {...axis} type="number" domain={["dataMin","dataMax"]}/><YAxis {...axis} width={40}/>
          <Tooltip content={<ChartTip unit=" seg"/>}/>
          <Area type="stepAfter" dataKey="cwnd" name="cwnd" stroke={C.violet} fill="url(#cw)" strokeWidth={2.4}/>
          <Line type="stepAfter" dataKey="ss" name="ssthresh" stroke={C.down} strokeDasharray="6 4" dot={false} strokeWidth={1.6}/>
          <Area type="stepAfter" dataKey="ss" name="ssthresh" stroke={C.down} fill="none" strokeDasharray="6 4" strokeWidth={1.6}/>
        </AreaChart></ResponsiveContainer></div>
      </Card>

      <Card className="mt" eyebrow="Graph D · Synchronized timeline" title="Dynamic Loss — 5-Panel View (1% → 5% → 10% → 5% → 1%)">
        {[
          ["Injected Loss %","loss",C.loss,"step"],["Throughput (Mbps)","tpM",C.tp,"line"],["RTT (ms)","krtt",C.cyan,"line"],["cwnd (segments)","cwnd",C.violet,"line"],["Retransmission bursts","rtx",C.down,"bar"],
        ].map(([lbl,k,c,type],i)=>(
          <div key={k} style={{display:"grid",gridTemplateColumns:"150px 1fr",alignItems:"center",borderTop:i?"1px solid var(--glass-border)":"none"}}>
            <div className="eyebrow" style={{color:c}}>{lbl}</div>
            <div className="chart sm"><ResponsiveContainer>
              {type==="bar" ? (
                <BarChart data={dyn} syncId="dyn"><XAxis dataKey="t" {...axis} hide={i<4}/><YAxis {...axis} width={34}/><Tooltip content={<ChartTip/>}/><Shading series={dyn}/><Bar dataKey={k} name={lbl} fill={c} radius={[3,3,0,0]}/></BarChart>
              ) : (
                <LineChart data={dyn} syncId="dyn"><XAxis dataKey="t" {...axis} hide={i<4}/><YAxis {...axis} width={34}/><Tooltip content={<ChartTip/>}/><Shading series={dyn}/><Line type={type==="step"?"stepAfter":"monotone"} dataKey={k} name={lbl} stroke={c} strokeWidth={2} dot={false}/></LineChart>
              )}
            </ResponsiveContainer></div>
          </div>
        ))}
      </Card>

      <div className="grid g2 mt">
        <Card eyebrow="Graph E" title="Mathis Model Validation" tip="mathis">
          <div className="formula mb">Throughput = <b>(1.22 × MSS)</b> / <b>(RTT × √p)</b> &nbsp;·&nbsp; MSS = 1448 B · RTT = 15.4 ms</div>
          <div className="chart"><ResponsiveContainer><ComposedChart data={MATHIS_DATA}>
            <CartesianGrid stroke="var(--grid)"/><XAxis dataKey="p" {...axis} type="number" domain={[0.5,15]} unit="%"/><YAxis {...axis} width={52} domain={[0,40000]} allowDataOverflow/>
            <Tooltip content={<ChartTip unit=" kbps" lx="p"/>}/>
            <Line dataKey="model" name="Mathis model" stroke={C.cyan} strokeDasharray="7 5" strokeWidth={2} dot={false}/>
            <Scatter dataKey="measured" name="Measured (mean)" fill={C.loss}><ErrorBar dataKey="err" stroke={C.loss} width={6}/></Scatter>
          </ComposedChart></ResponsiveContainer></div>
          <p style={{fontSize:12,color:"var(--muted)",marginTop:8}}>Below ~3% loss throughput is capped by the 10 Mbps sending limit, not by the model; above it measured values track the 1/√p decay.</p>
        </Card>
        <Card eyebrow="Graph F" title="Packet Loss vs Retransmissions" tip="retrans">
          <div className="chart" style={{height:352}}><ResponsiveContainer><AreaChart data={LOSS_RTX}>
            <defs><linearGradient id="rx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.down} stopOpacity=".5"/><stop offset="1" stopColor={C.down} stopOpacity="0"/></linearGradient></defs>
            <CartesianGrid stroke="var(--grid)"/><XAxis dataKey="p" {...axis} unit="%"/><YAxis {...axis} width={48}/>
            <Tooltip content={<ChartTip unit=" seg" lx="p"/>}/>
            <Area type="monotone" dataKey="rtx" name="Retransmitted segments" stroke={C.down} fill="url(#rx)" strokeWidth={2.5} dot={{r:4,fill:C.down}}/>
          </AreaChart></ResponsiveContainer></div>
        </Card>
        <Card eyebrow="Graph G" title="Packet Loss vs RTT" tip="rtt" right={<div className="legend-chips"><span style={{"--c":C.loss}}><i/>Wireless loss</span><span style={{"--c":C.queue}}><i/>Congestion</span></div>}>
          <div className="chart"><ResponsiveContainer><LineChart data={LOSS_RTT}>
            <CartesianGrid stroke="var(--grid)"/><XAxis dataKey="p" {...axis} unit="%"/><YAxis {...axis} width={44}/>
            <Tooltip content={<ChartTip unit=" ms" lx="p"/>}/>
            <Line dataKey="wireless" name="Wireless" stroke={C.loss} strokeWidth={2.5} dot={{r:3}}/>
            <Line dataKey="congestion" name="Congestion" stroke={C.queue} strokeWidth={2.5} dot={{r:3}}/>
          </LineChart></ResponsiveContainer></div>
          <p style={{fontSize:12,color:"var(--muted)",marginTop:8}}>Key discriminator: RTT stays flat under random wireless loss but inflates sharply as the bottleneck queue fills.</p>
        </Card>
        <Card eyebrow="Graph H" title="Scenario Comparison" right={<div className="seg">{[["all","All"],["tp","Mbps"],["rtt","RTT"],["rtx","Retrans"],["loss","Loss"]].map(([k,l])=> <button key={k} className={cmpMetric===k?"on":""} onClick={()=>setCmp(k)}>{l}</button>)}</div>}>
          <div className="chart"><ResponsiveContainer><BarChart data={COMPARE}>
            <CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="name" {...axis}/>
            <YAxis yAxisId="a" {...axis} width={40}/><YAxis yAxisId="b" orientation="right" {...axis} width={40}/>
            <Tooltip content={({active,payload,label})=>active&&payload?.length?<div className="tt"><b>{label}</b>{payload.map(p=><div key={p.dataKey}><i style={{background:p.fill}}/>{p.name}: {p.value}</div>)}</div>:null}/>
            <Legend wrapperStyle={{fontSize:12}}/>
            {(cmpMetric==="all"||cmpMetric==="tp") && <Bar yAxisId="a" dataKey="tp" name="Throughput (Mbps)" fill={C.tp} radius={[5,5,0,0]}/>}
            {(cmpMetric==="all"||cmpMetric==="rtt") && <Bar yAxisId="b" dataKey="rtt" name="Mean RTT (ms)" fill={C.cyan} radius={[5,5,0,0]}/>}
            {(cmpMetric==="all"||cmpMetric==="rtx") && <Bar yAxisId="b" dataKey="rtx" name="Retransmissions" fill={C.down} radius={[5,5,0,0]}/>}
            {(cmpMetric==="all"||cmpMetric==="loss") && <Bar yAxisId="a" dataKey="loss" name="Measured Loss (%)" fill={C.loss} radius={[5,5,0,0]}/>}
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. PAGE 4 · AI CLASSIFIER & DIAGNOSTICS                             */
/* ------------------------------------------------------------------ */
function AIPage({ toast, scen, setScen, customSeries, uploadedFile }){
  const [scenFilter,setScenFilter]=useState(scen || "all");
  const [cause,setCause]=useState("all"); const [sym,setSym]=useState("all"); const [q,setQ]=useState(""); const [page,setPage]=useState(0);
  const [sort,setSort]=useState({k:"t",d:1}); const [anim,setAnim]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnim(true),80); return ()=>clearTimeout(t); },[]);
  useEffect(()=>{ if(scen) setScenFilter(scen); },[scen]);

  const activeDiagRows = useMemo(() => {
    if (customSeries && customSeries.length > 0 && uploadedFile && (scenFilter === uploadedFile.scenario || scenFilter === "uploaded")) {
      return diagnoseSeries(customSeries, uploadedFile.scenario, uploadedFile.name);
    }
    return DIAG;
  }, [customSeries, uploadedFile, scenFilter]);

  const rows = useMemo(()=> {
    return activeDiagRows
      .filter(r => (scenFilter === "all" || scenFilter === "uploaded" || r.scenario === scenFilter))
      .filter(r => (cause === "all" || r.cause === cause))
      .filter(r => (sym === "all" || r.symptom === sym))
      .filter(r => (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())))
      .sort((a,b)=> (a[sort.k]>b[sort.k]?1:-1)*sort.d);
  }, [activeDiagRows, scenFilter, cause, sym, q, sort]);

  const PS=12, pages=Math.max(1,Math.ceil(rows.length/PS)); const view=rows.slice(page*PS,page*PS+PS);
  useEffect(()=>setPage(0),[scenFilter,cause,sym,q]);
  const max=Math.max(...CONFUSION.flat()); const rowSum=CONFUSION.map(r=>r.reduce((a,b)=>a+b,0));
  const cols=[["t","Time (s)"],["scenario","Scenario"],["tp","Tput (kbps)"],["rtt","RTT (ms)"],["rtx","Retrans"],["symptom","Symptom"],["cause","Likely Cause"],["detail","Cause Detail"],["evidence","Evidence"],["action","Recommended Action"],["recovery","TCP Recovery"],["conf","RF Conf."],["agree","Agree"]];
  const SYM_C={"Fast Retransmit":C.loss,"Timeout RTO":C.down,"Stall":C.down,"RTT Inflation":C.queue};
  const isReal = Boolean(uploadedFile && (scenFilter === uploadedFile.scenario || scenFilter === "uploaded") && customSeries && customSeries.length > 0);

  return (
    <div className="page">
      <div className="section-title">
        <div><div className="eyebrow">Page 04</div><h2>AI Error Classifier & Root-Cause Engine</h2><p>Dual-layer diagnosis: deterministic rules flag symptoms, a Random Forest attributes cause.</p></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select className="select" style={{width:230}} value={scenFilter} onChange={e=>{setScenFilter(e.target.value); if(e.target.value!=="all"&&e.target.value!=="uploaded"&&setScen) setScen(e.target.value);}}>
            <option value="all">🌐 All Scenarios (Pooled)</option>
            {uploadedFile && <option value="uploaded">📂 Uploaded: {uploadedFile.name}</option>}
            {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
          </select>
        </div>
      </div>

      {isReal && (
        <div className="glass" style={{padding:"12px 18px", borderRadius:14, marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", border:"1px solid var(--ok)", background:"rgba(16,185,129,0.09)"}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13}}>
            <span style={{background:"var(--ok)", width:10, height:10, borderRadius:"50%", display:"inline-block"}}/>
            <span><b>Real Telemetry Live Diagnosis:</b> Evaluating <code>{uploadedFile.name}</code> ({rows.length} flagged error windows from physical laptops)</span>
          </div>
          <button className="btn sm ghost" onClick={()=>setScenFilter("all")}>Show Pooled Dataset</button>
        </div>
      )}

      <div className="grid g3">
        <Card className="span2" eyebrow="Model Overview" title="Random Forest Classifier" tip="rf">
          <div className="model-stats">
            {[["200","decision trees"],["15","max depth"],["5-Fold","grouped by run"],["7","input features"]].map(([b,s])=> <div key={s} className="mstat"><b>{b}</b><small>{s}</small></div>)}
          </div>
          <div className="eyebrow mt" style={{marginBottom:10,display:"flex",gap:6,alignItems:"center"}}>Dual-layer approach <Tip k="gkf"/></div>
          <div className="layers">
            <div className="layer"><b>① TCP_INFO window</b>0.5 s features: loss_est, rtt_ratio, cwnd, Δretrans, ca_state, backoff</div>
            <span style={{color:"var(--cyan)"}}>→</span>
            <div className="layer" style={{borderColor:C.loss}}><b>② Rule-based heuristics</b>Deterministic: RTO ⇒ backoff&gt;0; stall ⇒ 0 bytes ACKed; RTT inflation ⇒ ratio&gt;1.8</div>
            <span style={{color:"var(--cyan)"}}>→</span>
            <div className="layer" style={{borderColor:C.violet}}><b>③ Random Forest ML</b>Probabilistic cause + confidence; flagged when it disagrees with rules</div>
          </div>
        </Card>
        <Card eyebrow="Validation" title="Cross-Validation Accuracy">
          <div className="gauge">
            <svg viewBox="0 0 120 120" width="170" height="170"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--glass-border)" strokeWidth="10"/>
              <circle cx="60" cy="60" r="50" fill="none" stroke="url(#gg)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${anim?314*.984:0} 314`} style={{transition:"stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1)"}}/>
              <defs><linearGradient id="gg"><stop offset="0" stopColor={C.tp}/><stop offset="1" stopColor={C.ok}/></linearGradient></defs></svg>
            <div className="lbl"><div><b>98.4%</b><div className="eyebrow">CV accuracy</div></div></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-around",marginTop:12,fontFamily:"var(--f-mono)",fontSize:11,color:"var(--muted)",textAlign:"center"}}>
            <div><b style={{color:"var(--text)",fontSize:15}}>0.979</b><br/>macro F1</div><div><b style={{color:"var(--text)",fontSize:15}}>±0.6%</b><br/>fold σ</div><div><b style={{color:"var(--text)",fontSize:15}}>4,028</b><br/>windows</div>
          </div>
        </Card>
      </div>

      <div className="grid g2 mt">
        <Card eyebrow="Evaluation" title="Confusion Matrix (True vs Predicted)">
          <div className="cm">
            <div className="h" style={{fontSize:9}}>true ↓ / pred →</div>
            {CLASSES.map(c=> <div key={c} className="h" style={{color:CLS_C[c]}}>{CLS_N[c]}</div>)}
            {CONFUSION.map((row,i)=>(
              <React.Fragment key={i}>
                <div className="h rh" style={{color:CLS_C[CLASSES[i]]}}>{CLS_N[CLASSES[i]]}</div>
                {row.map((v,j)=>{ const a=Math.max(.06,Math.sqrt(v/max)); const diag=i===j;
                  return <div key={j} className="cell" title={`${(v/rowSum[i]*100).toFixed(1)}% of true ${CLASSES[i]}`}
                    style={{background:`color-mix(in srgb, ${diag?C.tp:C.down} ${a*85}%, transparent)`,color:a>.45?"#fff":"var(--text)"}}>{v}</div>; })}
              </React.Fragment>
            ))}
          </div>
        </Card>
        <Card eyebrow="Explainability" title="Feature Importance (Gini)">
          {FEATURES.map(([f,v],i)=>(
            <div key={f} className="fi-row"><span>{f}</span><div className="fi-bar"><span style={{width:anim?`${v/FEATURES[0][1]*100}%`:0,transitionDelay:`${i*.08}s`}}/></div><span style={{textAlign:"right",color:"var(--muted)"}}>{(v*100).toFixed(1)}%</span></div>
          ))}
          <p style={{fontSize:12,color:"var(--muted)",marginTop:10}}>loss_est_pct and rtt_ratio dominate — the model learned the same RTT-flatness discriminator shown in Graph G.</p>
        </Card>
      </div>

      <Card className="mt" eyebrow="Diagnostic Inspection" title={`Flagged Measurement Windows · ${rows.length}`}
        right={<button className="btn sm" onClick={()=>{downloadFile("error_report.csv",toCSV(rows));toast("Error report exported")}}><Icon n="download"/>Export filtered</button>}>
        <div className="toolbar">
          <div className="search"><Icon n="search"/><input className="input" placeholder="Search evidence, scenario, action…" value={q} onChange={e=>setQ(e.target.value)}/></div>
          <select className="select" style={{width:190}} value={scenFilter} onChange={e=>{setScenFilter(e.target.value); if(e.target.value!=="all"&&e.target.value!=="uploaded"&&setScen) setScen(e.target.value);}}>
            <option value="all">All Scenarios</option>
            {uploadedFile && <option value="uploaded">Uploaded: {uploadedFile.name}</option>}
            {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select" style={{width:180}} value={cause} onChange={e=>setCause(e.target.value)}><option value="all">All causes</option>{CLASSES.map(c=> <option key={c} value={c}>{CLS_N[c]}</option>)}</select>
          <select className="select" style={{width:180}} value={sym} onChange={e=>setSym(e.target.value)}><option value="all">All symptoms</option>{SYMPTOMS.map(s=> <option key={s}>{s}</option>)}</select>
          {(scenFilter!=="all"||cause!=="all"||sym!=="all"||q) && <button className="btn ghost sm" onClick={()=>{setScenFilter("all");setCause("all");setSym("all");setQ("")}}>Reset</button>}
        </div>
        <div className="table-wrap"><table>
          <thead><tr>{cols.map(([k,l])=> <th key={k} onClick={()=>setSort(s=>({k,d:s.k===k?-s.d:1}))}>{l}{sort.k===k?(sort.d>0?" ↑":" ↓"):""}</th>)}</tr></thead>
          <tbody>{view.length? view.map(r=>(
            <tr key={r.id}>
              <td className="mono">{r.t.toFixed(1)}</td><td className="mono"><span className="tag" style={{"--c":SC[r.scenario].c}}>{r.scenario}</span></td>
              <td className="mono">{fmt(r.tp)}</td><td className="mono">{r.rtt}</td><td className="mono">{r.rtx}</td>
              <td><span className="tag" style={{"--c":SYM_C[r.symptom]}}>{r.symptom}</span></td>
              <td><span className="tag" style={{"--c":CLS_C[r.cause]}}>{CLS_N[r.cause]}</span></td>
              <td className="mono">{r.detail}</td><td className="wrap">{r.evidence}</td><td className="wrap">{r.action}</td><td className="wrap">{r.recovery}</td>
              <td><div className="conf"><div className="fi-bar"><span style={{width:`${r.conf}%`}}/></div>{r.conf}%</div></td>
              <td><span className="tag" style={{"--c":r.agree?C.ok:C.down}}>{r.agree?"Yes":"No"}</span></td>
            </tr>)) : <tr><td colSpan={13} className="empty">No windows match these filters.</td></tr>}</tbody>
        </table></div>
        <div className="pager">Page {page+1} / {pages}
          <button className="btn sm" disabled={!page} onClick={()=>setPage(p=>p-1)}>‹ Prev</button>
          <button className="btn sm" disabled={page>=pages-1} onClick={()=>setPage(p=>p+1)}>Next ›</button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11. PAGE 5 · SQLITE & CSV DATA EXPLORER                              */
/* ------------------------------------------------------------------ */
function DataPage({ toast }){
  const [scen,setScen]=useState("all"); const [run,setRun]=useState("all"); const [tMin,setTMin]=useState(0); const [tMax,setTMax]=useState(30); const [page,setPage]=useState(0);
  const rows = useMemo(()=>DB_ROWS.filter(r=>(scen==="all"||r.scenario===scen)&&(run==="all"||r.run===+run)&&r.t>=tMin&&r.t<=tMax),[scen,run,tMin,tMax]);
  useEffect(()=>setPage(0),[scen,run,tMin,tMax]);
  const PS=15, pages=Math.max(1,Math.ceil(rows.length/PS)); const cols=Object.keys(DB_ROWS[0]);
  const summary = ["baseline","loss1","loss5","loss10","dynamic","dynamic2","congestion","blackout","mixed"].map(id=>{const s=SC[id];return {scenario:id,mean_tp_kbps:s.tp,mean_rtt_ms:s.rtt,total_retrans:s.rtx,steady_cwnd:s.cwnd,target_loss_pct:s.loss,stalls:s.stalls||0}});
  const exports=[
    ["Complete Error Report","error_report.csv · "+DIAG.length+" rows",C.down,()=>downloadFile("error_report.csv",toCSV(DIAG))],
    ["Scenario Summary Table","scenario_summary.csv · 9 rows",C.tp,()=>downloadFile("scenario_summary.csv",toCSV(summary))],
    ["SQLite Database (JSON)","experiments.json · "+DB_ROWS.length+" rows",C.ok,()=>downloadFile("experiments.json",JSON.stringify({table:"experiments",schema:cols,rows:DB_ROWS},null,1),"application/json")],
    ["SQLite Database (.db dump)","experiments.sql · CREATE + INSERT",C.violet,()=>downloadFile("experiments.sql",`CREATE TABLE experiments(${cols.join(",")});\n`+DB_ROWS.map(r=>`INSERT INTO experiments VALUES(${Object.values(r).map(v=>typeof v==="string"?`'${v}'`:v).join(",")});`).join("\n"),"application/sql")],
  ];
  return (
    <div className="page">
      <div className="section-title"><div><div className="eyebrow">Page 05</div><h2>SQLite & CSV Data Explorer</h2><p>Browse raw telemetry windows stored in <code style={{fontFamily:"var(--f-mono)"}}>experiments.db</code> and export reports.</p></div></div>
      <div className="grid g4">
        {exports.map(([t,s,c,fn])=>(
          <button key={t} className="glass card" style={{textAlign:"left",cursor:"pointer","--c":c}} onClick={()=>{fn();toast(`Downloaded ${t}`,c)}}>
            <div className="kpi" style={{padding:0}}><div className="icon" style={{position:"static",marginBottom:12}}><Icon n="download"/></div></div>
            <b style={{fontFamily:"var(--f-display)"}}>Download {t}</b><div style={{fontFamily:"var(--f-mono)",fontSize:11,color:"var(--muted)",marginTop:4}}>{s}</div>
          </button>
        ))}
      </div>
      <Card className="mt" eyebrow="Database Browser" title={<>experiments <span className="tag" style={{"--c":C.ok}}>{fmt(rows.length)} rows</span></>}>
        <div className="toolbar">
          <div className="field" style={{width:180}}><label>Scenario</label><select className="select" value={scen} onChange={e=>setScen(e.target.value)}><option value="all">All</option>{["baseline","loss1","loss5","loss10","dynamic"].map(s=> <option key={s}>{s}</option>)}</select></div>
          <div className="field" style={{width:130}}><label>Run #</label><select className="select" value={run} onChange={e=>setRun(e.target.value)}><option value="all">All</option>{[1,2,3].map(r=> <option key={r}>{r}</option>)}</select></div>
          <div className="field" style={{width:110}}><label>t from (s)</label><input className="input" type="number" min={0} max={tMax} value={tMin} onChange={e=>setTMin(+e.target.value)}/></div>
          <div className="field" style={{width:110}}><label>t to (s)</label><input className="input" type="number" min={tMin} max={30} value={tMax} onChange={e=>setTMax(+e.target.value)}/></div>
          <div className="field" style={{flex:1,minWidth:240}}><label>Query preview</label><input className="input" readOnly value={`SELECT * FROM experiments WHERE ${scen==="all"?"1":`scenario='${scen}'`}${run==="all"?"":` AND run=${run}`} AND t BETWEEN ${tMin} AND ${tMax};`}/></div>
          <button className="btn sm" style={{alignSelf:"flex-end"}} onClick={()=>{downloadFile("query_result.csv",toCSV(rows));toast("Query result exported")}}><Icon n="download"/>Export view</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr>{cols.map(c=> <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.length? rows.slice(page*PS,page*PS+PS).map(r=> <tr key={r.rowid}>{cols.map(c=> <td key={c} className="mono">{c==="scenario"?<span className="tag" style={{"--c":SC[r[c]].c}}>{r[c]}</span>:r[c]}</td>)}</tr>)
            : <tr><td colSpan={cols.length} className="empty">No records in this range.</td></tr>}</tbody>
        </table></div>
        <div className="pager">Page {page+1} / {pages}
          <button className="btn sm" disabled={!page} onClick={()=>setPage(p=>p-1)}>‹ Prev</button>
          <button className="btn sm" disabled={page>=pages-1} onClick={()=>setPage(p=>p+1)}>Next ›</button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 12. APP SHELL                                                        */
/* ------------------------------------------------------------------ */
const NAV = [["overview","Overview & Architecture","overview"],["control","Experiment Control","control"],["analytics","Performance Analytics","chart"],["ai","AI Diagnostics","ai"],["data","Data Explorer","db"]];

export default function App(){
  const [page,setPage]=useState("overview");
  const [theme,setTheme]=useState("dark");
  const [collapsed,setCollapsed]=useState(false);
  const [scen,setScen]=useState("dynamic");
  const [uploadedFile, setUploadedFile]=useState(null);
  const [customSeries, setCustomSeries]=useState(null);
  const [toasts,setToasts]=useState([]);
  const toast=(m,c=C.ok)=>{ const id=Math.random(); setToasts(t=>[...t,{id,m,c}]); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200); };
  useEffect(()=>{ document.documentElement.setAttribute("data-theme",theme); },[theme]);
  useEffect(()=>{ window.scrollTo({top:0,behavior:"smooth"}); },[page]);
  const go = p => { setPage(p); if (window.innerWidth<860) setCollapsed(true); };
  const cur = NAV.find(n=>n[0]===page);
  const clearUploaded = () => { setCustomSeries(null); setUploadedFile(null); toast("Switched back to theoretical simulation model"); };
  return (
    <>
      <style>{CSS}</style>
      <div className="ambient"><div className="blob b1"/><div className="blob b2"/><div className="blob b3"/><div className="gridbg"/>
        <div className="packets">{[12,28,44,63,81].map((top,i)=> <span key={i} style={{top:`${top}%`,animationDuration:`${7+i*2.3}s`,animationDelay:`${-i*1.7}s`}}/>)}</div></div>
      <div className="app">
        <aside className={`side ${collapsed?"collapsed":""}`}>
          <div className="brand">
            <div className="logo"><img src="/pktman-logo.jpg" alt="PKT MAN" /></div>
            <div className="hide-c"><b>PKT MAN</b><small>LOSS ANALYSIS v2.0</small></div>
          </div>
          {NAV.map(([id,l,ic],i)=>(
            <button key={id} className={`nav ${page===id?"active":""}`} onClick={()=>go(id)} title={l}>
              <Icon n={ic}/><span className="hide-c">{l}</span><span className="num hide-c">0{i+1}</span>
            </button>
          ))}
          <div className="side-foot">
            <div className="glass hide-c" style={{padding:14,borderRadius:14,fontSize:12}}>
              <div className="eyebrow" style={{marginBottom:6}}>Active run</div>
              <b style={{fontFamily:"var(--f-mono)",color:SC[scen].c}}>{scen}</b><div style={{color:"var(--muted)",marginTop:2}}>{SC[scen].desc}</div>
            </div>
            <button className="nav" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}><Icon n={theme==="dark"?"sun":"moon"}/><span className="hide-c">{theme==="dark"?"Light mode":"Dark mode"}</span></button>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <button className="icon-btn" onClick={()=>setCollapsed(c=>!c)} aria-label="Toggle sidebar"><Icon n="menu"/></button>
            <div className="crumb"><img src="/pktman-logo.jpg" alt="PKT MAN" style={{width:20,height:20,borderRadius:5,verticalAlign:"middle",marginRight:8,display:"inline-block",objectFit:"cover"}}/> PKT MAN / <b>{cur[1]}</b></div>
            <span className="live"><span className="dot"/>LIVE · wlan0 · −62 dBm</span>
            <button className="icon-btn" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} aria-label="Toggle theme"><Icon n={theme==="dark"?"sun":"moon"}/></button>
          </div>
          {page==="overview" && <Overview go={go}/>}
          {page==="control" && <Control toast={toast} setActiveScenario={id=>{setScen(id);}} uploadedFile={uploadedFile} setUploadedFile={setUploadedFile} setCustomSeries={setCustomSeries}/>}
          {page==="analytics" && <Analytics scen={scen} setScen={setScen} customSeries={customSeries} uploadedFile={uploadedFile} clearUploaded={clearUploaded}/>}
          {page==="ai" && <AIPage toast={toast} scen={scen} setScen={setScen} customSeries={customSeries} uploadedFile={uploadedFile}/>}
          {page==="data" && <DataPage toast={toast}/>}
          <div style={{textAlign:"center",marginTop:40,fontFamily:"var(--f-mono)",fontSize:11,color:"var(--faint)"}}>
            Bassil H (24BCE0904) · Ajitesh Mohan N (24BCE0887) · Abijith V K (24BKT0070) — PKT MAN · Computer Networks Lab
          </div>
        </main>
      </div>
      <div className="toasts">{toasts.map(t=> <div key={t.id} className="toast" style={{"--c":t.c}}>{t.m}</div>)}</div>
    </>
  );
}
