#!/usr/bin/env python3
"""
Wedge Studio — District Zero
=============================
Run this file to start the Wedge Studio server.

    python wedge_studio.py            # starts on port 8080
    python wedge_studio.py 9090       # custom port

Then the browser opens automatically at http://localhost:<port>/
Press Ctrl+C to stop the server.
"""

import sys
import os
import json
import threading
import webbrowser
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# ── embedded HTML (the full Wedge Studio UI) ──────────────────────────────────
HTML = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Wedge Studio — District Zero</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\n\n:root {\n    --bg-primary: #0a0a0a;\n    --bg-secondary: #0c0c0c;\n    --bg-tertiary: #0e0e0e;\n    --border-primary: #1e1e1e;\n    --border-secondary: #2a2a2a;\n    --text-primary: #e8e4dc;\n    --text-secondary: #888880;\n    --text-dim: #555550;\n    --accent-gold: #d18d1f;\n    --accent-gold-dim: #8a5c14;\n    --glow-gold: rgba(209, 141, 31, 0.4);\n    --node-bg: #141414;\n    --ok: #5ad17a;\n    --warn: #f0b656;\n    --err: #ff6b6b;\n    --running: #6ea8fe;\n    --ease: cubic-bezier(0.4, 0, 0.2, 1);\n}\n\nbody {\n    font-family: \'DM Mono\', \'Courier New\', monospace;\n    background: var(--bg-primary);\n    color: var(--text-primary);\n    height: 100vh;\n    overflow: hidden;\n    display: flex;\n    flex-direction: column;\n}\n\nbody::before {\n    content: \'\';\n    position: fixed;\n    inset: 0;\n    background: repeating-linear-gradient(0deg, rgba(209,141,31,0.02) 0px, transparent 1px, transparent 2px, rgba(209,141,31,0.02) 3px);\n    pointer-events: none;\n    z-index: 1000;\n}\n\n/* ---------- HEADER ---------- */\n.header {\n    border-bottom: 1px solid var(--border-primary);\n    padding: 18px 28px;\n    display: flex; align-items: center; justify-content: space-between;\n    background: var(--bg-primary); flex-shrink: 0; gap: 20px;\n}\n.logo-wrap { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }\n.logo-img {\n    height: 36px; width: auto;\n}\n.logo-div { width: 1px; height: 28px; background: var(--border-secondary); }\n.logo-sub { font-size: 13px; letter-spacing: 0.2em; color: var(--accent-gold); text-transform: uppercase; }\n.logo-module { font-size: 13px; letter-spacing: 0.15em; color: var(--text-dim); text-transform: uppercase; }\n.logo-ver { font-size: 9px; color: var(--text-dim); letter-spacing: 0.1em; }\n.header-right { display: flex; align-items: center; gap: 14px; }\n.mode-pill {\n    font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;\n    padding: 5px 10px; border-radius: 3px; border: 1px solid;\n}\n.mode-pill.planning { color: var(--text-secondary); border-color: var(--border-secondary); }\n.mode-pill.local-ok { color: var(--ok); border-color: rgba(90,209,122,.4); box-shadow: 0 0 10px rgba(90,209,122,.15); }\n.mode-pill.local-bad { color: var(--err); border-color: rgba(255,107,107,.4); }\n.cfg { display: flex; align-items: center; gap: 6px; }\n.cfg label { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); }\n.cfg input {\n    background: var(--bg-tertiary); border: 1px solid var(--border-secondary); color: var(--text-primary);\n    font-family: inherit; font-size: 11px; padding: 6px 8px; border-radius: 3px; outline: none;\n    transition: border-color .2s var(--ease);\n}\n.cfg input:focus { border-color: var(--accent-gold); }\n\n/* ---------- DROPZONE ---------- */\n.dropzone {\n    margin: 8px 12px; border: 1px dashed var(--border-secondary); border-radius: 3px;\n    padding: 14px; text-align: center; font-size: 10px; letter-spacing: 0.08em;\n    text-transform: uppercase; color: var(--text-dim); transition: all .2s var(--ease);\n    cursor: pointer;\n}\n.dropzone:hover { border-color: var(--accent-gold-dim); color: var(--text-secondary); }\n.dropzone.over { border-color: var(--accent-gold); background: rgba(209,141,31,0.06); color: var(--accent-gold); }\n\n/* ---------- LAYOUT ---------- */\n.workspace { flex: 1; display: flex; overflow: hidden; }\n.col { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border-primary); }\n.col-avail { width: 290px; flex-shrink: 0; }\n.col-order { width: 330px; flex-shrink: 0; }\n.col-main { flex: 1; }\n.col-head {\n    padding: 14px 18px; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;\n    color: var(--text-dim); border-bottom: 1px solid var(--border-primary);\n    display: flex; align-items: center; justify-content: space-between; background: var(--bg-secondary);\n}\n.col-body { flex: 1; overflow-y: auto; padding: 12px; }\n\n/* ---------- buttons ---------- */\n.btn {\n    padding: 9px 14px; font-family: inherit; font-size: 10px; letter-spacing: 0.1em;\n    text-transform: uppercase; cursor: pointer; border: 1px solid var(--border-secondary);\n    background: var(--bg-secondary); color: var(--text-primary); border-radius: 3px;\n    transition: all .3s var(--ease); position: relative; overflow: hidden;\n}\n.btn::before {\n    content: \'\'; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;\n    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); transition: left .5s;\n}\n.btn:hover::before { left: 100%; }\n.btn:hover { border-color: var(--accent-gold); background: rgba(209,141,31,0.1); transform: translateY(-1px); box-shadow: 0 4px 20px var(--glow-gold); }\n.btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }\n.btn:disabled::before { display: none; }\n.btn-primary { background: var(--accent-gold); border-color: var(--accent-gold); color: #000; font-weight: 500; }\n.btn-primary:hover { background: #e09d2f; transform: translateY(-2px); box-shadow: 0 8px 30px var(--glow-gold); }\n.btn-sm { padding: 5px 9px; font-size: 9px; }\n.btn-danger:hover { border-color: var(--err); background: rgba(255,107,107,.1); box-shadow: 0 4px 20px rgba(255,107,107,.3); }\n\n/* ---------- available list ---------- */\n.wf-item {\n    background: var(--bg-tertiary); border: 1px solid var(--border-primary); color: var(--text-primary);\n    padding: 9px 12px; margin-bottom: 5px; border-radius: 3px; font-size: 11px; cursor: pointer;\n    transition: all .2s var(--ease); user-select: none; display: flex; align-items: center; gap: 8px;\n    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n}\n.wf-item:hover { border-color: var(--accent-gold-dim); }\n.wf-item.selected { border-color: var(--accent-gold); background: rgba(209,141,31,0.12); }\n.wf-item.invalid { opacity: .45; border-style: dashed; }\n.wf-item .seq {\n    width: 18px; height: 18px; flex-shrink: 0; border-radius: 3px; background: var(--accent-gold); color: #000;\n    font-size: 9px; display: none; align-items: center; justify-content: center; font-weight: 500;\n}\n.wf-item.selected .seq { display: flex; }\n.sel-row { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }\n.sel-info { font-size: 9px; color: var(--text-dim); letter-spacing: 0.05em; margin-bottom: 10px; word-break: break-all; min-height: 14px; }\n\n/* ---------- run order ---------- */\n.unit {\n    background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: 3px;\n    padding: 10px 12px; margin-bottom: 6px; font-size: 11px; cursor: grab;\n    transition: border-color .2s var(--ease), opacity .2s; position: relative;\n    display: flex; align-items: center; gap: 8px;\n}\n.unit:hover { border-color: var(--accent-gold-dim); }\n.unit.selected { border-color: var(--accent-gold); }\n.unit.dragging { opacity: .4; cursor: grabbing; }\n.unit.drag-over { border-top: 2px solid var(--accent-gold); }\n.unit .idx { color: var(--text-dim); font-size: 9px; flex-shrink: 0; width: 16px; }\n.unit .ico { flex-shrink: 0; }\n.unit .lbl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.unit.chain { color: var(--accent-gold); }\n.unit.running { border-color: var(--running); color: var(--running); box-shadow: 0 0 8px rgba(110,168,254,.25); }\n.unit.ok      { border-color: var(--ok); color: var(--ok); }\n.unit.fail    { border-color: var(--err); color: var(--err); }\n/* chain row gold while running — individual nodes still show blue/green/red in graph */\n.unit.chain.running { border-color: var(--accent-gold); color: var(--accent-gold); box-shadow: 0 0 8px rgba(209,141,31,.3); }\n.unit .mode-tag {\n    font-size: 8px; letter-spacing: .08em; padding: 2px 6px; border-radius: 2px; flex-shrink: 0;\n    border: 1px solid var(--border-secondary); text-transform: uppercase;\n}\n.unit .timeout-field {\n    display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 2px;\n}\n.unit .timeout-field input {\n    width: 38px; background: var(--bg-tertiary); border: 1px solid var(--accent-gold-dim);\n    color: var(--accent-gold); font-family: inherit; font-size: 9px; padding: 2px 4px;\n    border-radius: 2px; outline: none; text-align: center;\n}\n.unit .timeout-field label { font-size: 8px; color: var(--accent-gold-dim); letter-spacing: .05em; }\n.unit .mode-tag.success { color: var(--ok); border-color: rgba(90,209,122,.4); }\n.unit .mode-tag.failure { color: var(--warn); border-color: rgba(240,182,86,.4); }\n\n/* ---------- graph ---------- */\n.graph-wrap { padding: 12px 18px; border-bottom: 1px solid var(--border-primary); max-height: 200px; overflow-y: auto; }\n.graph-title { font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px; }\n.chain-row { display: flex; align-items: center; gap: 0; margin-bottom: 12px; flex-wrap: wrap; cursor: pointer; }\n.chain-mode {\n    font-size: 8px; letter-spacing: .08em; text-transform: uppercase; margin-right: 10px;\n    padding: 3px 7px; border-radius: 2px; border: 1px solid var(--border-secondary); flex-shrink: 0;\n}\n.chain-mode.success { color: var(--ok); border-color: rgba(90,209,122,.4); }\n.chain-mode.failure { color: var(--warn); border-color: rgba(240,182,86,.4); }\n.gnode {\n    background: var(--node-bg); border: 1px solid var(--border-secondary); border-radius: 3px;\n    padding: 7px 12px; font-size: 10px; color: var(--text-primary); transition: all .3s var(--ease);\n    max-width: 150px; display: flex; flex-direction: column; gap: 3px; align-items: flex-start;\n}\n.gnode-lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 126px; }\n.vram-cb {\n    display: flex; align-items: center; gap: 3px; flex-shrink: 0;\n    font-size: 8px; letter-spacing: .05em; text-transform: uppercase;\n    color: var(--text-dim); cursor: pointer; user-select: none; line-height: 1;\n}\n.vram-cb input[type=checkbox] { accent-color: var(--accent-gold); width: 10px; height: 10px; cursor: pointer; margin: 0; }\n.vram-cb.on { color: var(--accent-gold); }\n/* VRAM cb in run-order row */\n.unit .vram-cb { margin-left: 6px; font-size: 9px; }\n.unit .vram-cb input[type=checkbox] { width: 11px; height: 11px; }\n.gnode.running { border-color: var(--running); color: var(--running); box-shadow: 0 0 10px rgba(110,168,254,.4); }\n.gnode.ok { border-color: var(--ok); color: var(--ok); box-shadow: 0 0 10px rgba(90,209,122,.3); }\n.gnode.fail { border-color: var(--err); color: var(--err); }\n.gnode.reused { border-style: dashed; opacity: .7; }\n.garrow { color: var(--text-dim); padding: 0 8px; font-size: 12px; }\n\n/* ---------- progress ---------- */\n.pbars { padding: 10px 18px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary); flex-shrink: 0; }\n.pbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }\n.pbar-row:last-child { margin-bottom: 0; }\n.pbar-lbl { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-dim); width: 46px; }\n.pbar-track { flex: 1; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; border: 1px solid var(--border-primary); }\n.pbar-fill { height: 100%; width: 0%; transition: width .25s var(--ease); border-radius: 3px; }\n.pbar-fill.job { background: var(--ok); box-shadow: 0 0 8px rgba(90,209,122,.5); }\n.pbar-fill.batch { background: var(--accent-gold); box-shadow: 0 0 8px var(--glow-gold); }\n.pbar-pct { font-size: 9px; color: var(--text-secondary); width: 64px; text-align: right; }\n\n/* ---------- log ---------- */\n.log-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 120px; }\n.log {\n    flex: 1; overflow-y: auto; padding: 12px 18px; font-size: 11px; line-height: 1.7;\n    background: var(--bg-secondary); white-space: pre-wrap; word-break: break-word;\n}\n.log .ts { color: var(--text-dim); }\n.log .info { color: var(--text-primary); }\n.log .muted { color: var(--text-secondary); }\n.log .ok { color: var(--ok); }\n.log .warn { color: var(--warn); }\n.log .err { color: var(--err); }\n.log .running { color: var(--running); }\n.log .header-line { color: var(--accent-gold); }\n.log .fallback { color: #f59edb; }\n\n/* ---------- results ---------- */\n.results { border-top: 1px solid var(--border-primary); padding: 12px 18px; max-height: 220px; overflow-y: auto; background: var(--bg-secondary); flex-shrink: 0; }\n.results-grid { display: flex; gap: 12px; flex-wrap: wrap; }\n.result-card {\n    background: var(--node-bg); border: 1px solid var(--border-primary); border-radius: 4px;\n    overflow: hidden; width: 180px; transition: all .2s var(--ease); position: relative;\n}\n.result-card:hover { border-color: var(--accent-gold-dim); }\n.result-thumb {\n    width: 100%; height: 101px; background: #000; cursor: pointer; position: relative;\n    display: flex; align-items: center; justify-content: center; overflow: hidden;\n}\n.result-thumb img, .result-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }\n.result-thumb .play {\n    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;\n    color: #fff; font-size: 28px; background: rgba(0,0,0,.25); transition: opacity .2s;\n    text-shadow: 0 0 12px rgba(0,0,0,.8);\n}\n.result-thumb:hover .play { opacity: .7; }\n.result-thumb .no-prev { color: var(--text-dim); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; }\n.result-meta { padding: 8px 10px; }\n.result-name { font-size: 10px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.result-status { font-size: 9px; margin-top: 3px; letter-spacing: .05em; }\n.result-status.ok { color: var(--ok); }\n.result-status.check { color: var(--warn); }\n.result-status.fail, .result-status.err { color: var(--err); }\n\n::-webkit-scrollbar { width: 8px; height: 8px; }\n::-webkit-scrollbar-track { background: var(--bg-primary); }\n::-webkit-scrollbar-thumb { background: var(--border-secondary); border-radius: 4px; }\n::-webkit-scrollbar-thumb:hover { background: var(--accent-gold-dim); }\n\n.section-label { font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: var(--text-dim); padding: 10px 18px 6px; }\n.empty-hint { color: var(--text-dim); font-size: 10px; line-height: 1.8; padding: 8px 4px; }\n\n/* ---------- planning banner ---------- */\n.planning-banner {\n    background: linear-gradient(90deg, rgba(209,141,31,0.08), rgba(209,141,31,0.02));\n    border-bottom: 1px solid rgba(209,141,31,0.25);\n    padding: 10px 28px;\n    font-size: 10px; color: var(--text-secondary); letter-spacing: 0.05em;\n    display: flex; align-items: center; justify-content: space-between; gap: 16px;\n}\n.planning-banner.hidden { display: none; }\n.planning-banner strong { color: var(--accent-gold); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }\n\n/* tooltip-ish info row */\n.info-line {\n    font-size: 9px; color: var(--text-dim); letter-spacing: 0.05em; padding: 6px 12px;\n}\n\n/* ---------- result card compare checkbox ---------- */\n.result-card { position: relative; }\n.result-card .compare-cb {\n    position: absolute; top: 6px; left: 6px; z-index: 100;\n    width: 22px; height: 22px; border-radius: 3px;\n    border: 1px solid var(--border-secondary); background: rgba(10,10,10,.85);\n    display: none; align-items: center; justify-content: center;\n    cursor: pointer; transition: all .2s var(--ease); font-size: 11px;\n    pointer-events: all; user-select: none;\n}\n.result-card:hover .compare-cb { display: flex; }\n.result-card.in-compare .compare-cb { display: flex; border-color: var(--accent-gold); background: var(--accent-gold); color: #000; }\n.result-card.in-compare { border-color: var(--accent-gold); box-shadow: 0 0 12px var(--glow-gold); }\n.compare-bar {\n    display: none; align-items: center; gap: 10px;\n    padding: 8px 18px; background: var(--bg-secondary);\n    border-top: 1px solid var(--border-primary); flex-shrink: 0;\n    font-size: 10px; color: var(--text-secondary); letter-spacing: .08em;\n}\n.compare-bar.visible { display: flex; }\n.compare-bar strong { color: var(--accent-gold); }\n\n/* ---------- lightbox ---------- */\n.lightbox {\n    position: fixed; inset: 0; z-index: 9000;\n    background: rgba(0,0,0,.92); display: none;\n    flex-direction: column; align-items: center; justify-content: center;\n}\n.lightbox.open { display: flex; }\n.lb-close {\n    position: absolute; top: 18px; right: 22px;\n    font-size: 22px; color: var(--text-dim); cursor: pointer;\n    transition: color .2s; z-index: 9100; background: none; border: none;\n    font-family: inherit;\n}\n.lb-close:hover { color: var(--text-primary); }\n.lb-nav {\n    position: absolute; top: 50%; transform: translateY(-50%);\n    font-size: 28px; color: var(--text-dim); cursor: pointer;\n    background: none; border: none; font-family: inherit;\n    transition: color .2s; z-index: 9100; padding: 0 18px;\n}\n.lb-nav:hover { color: var(--accent-gold); }\n.lb-prev { left: 0; }\n.lb-next { right: 0; }\n.lb-content {\n    max-width: calc(100vw - 120px); max-height: calc(100vh - 120px);\n    display: flex; align-items: center; justify-content: center;\n}\n.lb-content video, .lb-content img {\n    max-width: 100%; max-height: calc(100vh - 120px);\n    border-radius: 3px; display: block;\n}\n.lb-meta {\n    position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);\n    font-size: 10px; letter-spacing: .1em; color: var(--text-secondary);\n    background: rgba(0,0,0,.6); padding: 6px 14px; border-radius: 3px;\n    white-space: nowrap; text-align: center;\n}\n.lb-counter {\n    position: absolute; top: 18px; left: 50%; transform: translateX(-50%);\n    font-size: 9px; letter-spacing: .15em; text-transform: uppercase;\n    color: var(--text-dim);\n}\n\n/* ---------- compare / wipe lightbox ---------- */\n.wipe-lb {\n    position: fixed; inset: 0; z-index: 9000;\n    background: rgba(0,0,0,.95); display: none;\n    flex-direction: column; align-items: center; justify-content: center;\n}\n.wipe-lb.open { display: flex; }\n.wipe-wrap {\n    position: relative; overflow: hidden;\n    max-width: calc(100vw - 80px); max-height: calc(100vh - 140px);\n    border-radius: 3px; user-select: none;\n    display: flex; align-items: center; justify-content: center;\n}\n.wipe-a, .wipe-b {\n    position: absolute; inset: 0;\n    display: flex; align-items: center; justify-content: center;\n    overflow: hidden;\n}\n.wipe-a video, .wipe-a img,\n.wipe-b video, .wipe-b img {\n    width: 100%; height: 100%; object-fit: contain; display: block;\n}\n.wipe-a { clip-path: inset(0 50% 0 0); }  /* left half */\n.wipe-b { }                                 /* full, behind */\n.wipe-handle {\n    position: absolute; top: 0; bottom: 0; width: 3px;\n    background: var(--accent-gold); left: 50%;\n    transform: translateX(-50%); cursor: ew-resize; z-index: 10;\n    box-shadow: 0 0 10px var(--glow-gold);\n}\n.wipe-handle::after {\n    content: \'◀ ▶\'; position: absolute; top: 50%; left: 50%;\n    transform: translate(-50%,-50%);\n    background: var(--accent-gold); color: #000;\n    font-size: 10px; padding: 5px 8px; border-radius: 3px;\n    white-space: nowrap; letter-spacing: .05em;\n}\n.wipe-labels {\n    position: absolute; bottom: 0; left: 0; right: 0;\n    display: flex; justify-content: space-between; padding: 8px 12px;\n    pointer-events: none;\n}\n.wipe-lbl {\n    font-size: 9px; letter-spacing: .1em; text-transform: uppercase;\n    background: rgba(0,0,0,.7); padding: 4px 8px; border-radius: 3px;\n    max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n}\n.wipe-lbl.a { color: var(--running); }\n.wipe-lbl.b { color: var(--warn); }\n.wipe-controls {\n    display: flex; gap: 14px; align-items: center; margin-top: 14px;\n    font-size: 10px; letter-spacing: .08em; color: var(--text-secondary);\n    flex-direction: column; width: calc(100vw - 80px);\n}\n.wipe-controls-row { display: flex; gap: 14px; align-items: center; width: 100%; }\n.wipe-scrubber {\n    width: 100%; margin-top: 6px; display: flex; align-items: center; gap: 12px;\n}\n.scrub-track {\n    flex: 1; height: 28px; background: var(--bg3, #0e0e0e);\n    border: 1px solid var(--border-secondary, #2a2a2a); border-radius: 3px;\n    position: relative; cursor: ew-resize; overflow: hidden;\n}\n.scrub-fill {\n    position: absolute; top: 0; left: 0; height: 100%; width: 0%;\n    background: rgba(209,141,31,0.25); pointer-events: none; transition: none;\n}\n.scrub-needle {\n    position: absolute; top: 0; bottom: 0; width: 2px;\n    background: var(--accent-gold, #d18d1f);\n    box-shadow: 0 0 6px var(--glow-gold, rgba(209,141,31,0.4));\n    pointer-events: none; transform: translateX(-50%);\n}\n.scrub-label {\n    font-size: 9px; letter-spacing: .12em; color: var(--accent-gold, #d18d1f);\n    min-width: 80px; text-align: right; text-transform: uppercase;\n}\n.folder-browser {\n    position: fixed; inset: 0; z-index: 8000; background: rgba(0,0,0,.85);\n    display: none; align-items: center; justify-content: center;\n}\n.folder-browser.open { display: flex; }\n.fb-panel {\n    background: var(--bg-secondary); border: 1px solid var(--border-secondary);\n    border-radius: 4px; width: 560px; max-height: 70vh; display: flex; flex-direction: column;\n    box-shadow: 0 20px 60px rgba(0,0,0,.6);\n}\n.fb-head {\n    padding: 14px 18px; border-bottom: 1px solid var(--border-primary);\n    display: flex; align-items: center; gap: 10px;\n    font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-dim);\n}\n.fb-head .fb-title { flex: 1; color: var(--text-secondary); }\n.fb-breadcrumb {\n    padding: 10px 18px; border-bottom: 1px solid var(--border-primary);\n    font-size: 10px; color: var(--text-dim); white-space: nowrap; overflow: hidden;\n    text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;\n}\n.fb-crumb { cursor: pointer; color: var(--text-secondary); transition: color .2s; }\n.fb-crumb:hover { color: var(--accent-gold); }\n.fb-crumb.current { color: var(--text-primary); cursor: default; }\n.fb-sep { color: var(--text-dim); }\n.fb-list { flex: 1; overflow-y: auto; padding: 8px 0; }\n.fb-item {\n    padding: 9px 18px; font-size: 11px; cursor: pointer; display: flex;\n    align-items: center; gap: 10px; transition: background .15s;\n    color: var(--text-secondary);\n}\n.fb-item:hover { background: rgba(209,141,31,.08); color: var(--text-primary); }\n.fb-item .fb-ico { font-size: 13px; flex-shrink: 0; }\n.fb-foot {\n    padding: 12px 18px; border-top: 1px solid var(--border-primary);\n    display: flex; align-items: center; gap: 10px;\n    font-size: 10px;\n}\n.fb-current-path {\n    flex: 1; color: var(--text-secondary); white-space: nowrap; overflow: hidden;\n    text-overflow: ellipsis;\n}\n.fb-json-count { color: var(--accent-gold); font-size: 9px; letter-spacing: .08em; flex-shrink: 0; }\n.scrub-cfg {\n    display: flex; align-items: center; gap: 10px; margin-top: 6px;\n    font-size: 9px; letter-spacing: .1em; color: var(--text-secondary, #888880);\n}\n.scrub-cfg label { text-transform: uppercase; }\n.scrub-cfg input {\n    width: 46px; background: var(--bg3, #0e0e0e);\n    border: 1px solid var(--border-secondary, #2a2a2a); color: var(--fg, #e8e4dc);\n    font-family: inherit; font-size: 10px; padding: 4px 6px; border-radius: 3px;\n    outline: none; text-align: center;\n}\n.scrub-cfg input:focus { border-color: var(--accent-gold, #d18d1f); }\n.speed-btns { display: flex; gap: 4px; }\n.speed-btn {\n    padding: 3px 8px; font-family: inherit; font-size: 9px;\n    letter-spacing: .08em; text-transform: uppercase; cursor: pointer;\n    border: 1px solid var(--border-secondary, #2a2a2a);\n    background: var(--bg2, #0c0c0c); color: var(--text-secondary, #888880);\n    border-radius: 3px; transition: all .2s;\n}\n.speed-btn:hover { border-color: var(--accent-gold, #d18d1f); color: var(--fg, #e8e4dc); }\n.speed-btn.active { border-color: var(--accent-gold, #d18d1f); color: var(--accent-gold, #d18d1f); background: rgba(209,141,31,0.12); }\n.wipe-controls button { }\n\n\n/* ── bottom log terminal ── */\n#terminal {\n    position: fixed; bottom: 0; left: 0; right: 0; z-index: 500;\n    resize: vertical; overflow: hidden;\n}\n#terminal.collapsed {\n    height: 32px !important; resize: none; transition: height 0.25s var(--ease);\n}\n#terminal.open {\n    min-height: 100px; max-height: 80vh;\n}\n#terminal.resizing { transition: none !important; }\n\n#terminal-bar {\n    height: 32px; background: var(--bg-secondary);\n    border-top: 1px solid var(--border-primary);\n    display: flex; align-items: center; justify-content: space-between;\n    padding: 0 18px; cursor: pointer; user-select: none; position: relative;\n}\n#terminal-bar::before {\n    content: \'\'; position: absolute; top: -4px; left: 0; right: 0;\n    height: 8px; cursor: ns-resize; z-index: 10;\n}\n#terminal.open #terminal-bar:hover::before {\n    background: rgba(209,141,31,0.08);\n}\n#terminal.open #terminal-bar::after {\n    content: \'⋮⋮⋮\'; position: absolute; top: 50%; left: 50%;\n    transform: translate(-50%,-50%); font-size: 8px;\n    color: var(--text-dim); letter-spacing: 2px; pointer-events: none;\n}\n#terminal-bar-left { display: flex; align-items: center; gap: 10px; }\n#terminal-label {\n    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;\n    color: var(--text-dim);\n}\n#terminal-dot {\n    width: 6px; height: 6px; border-radius: 50%;\n    background: var(--text-dim); opacity: 0; transition: opacity 0.3s;\n}\n#terminal-dot.active { opacity: 1; }\n@keyframes termBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }\n#terminal-dot.blink { animation: termBlink 0.8s ease infinite; }\n#terminal-actions { display: flex; gap: 8px; }\n#terminal-body {\n    height: calc(100% - 32px); background: var(--bg-secondary);\n    border-top: 1px solid var(--border-primary);\n    overflow-y: auto; padding: 8px 18px;\n    font-size: 11px; font-family: inherit; display: none; line-height: 1.7;\n}\n#terminal.open #terminal-body { display: block; }\n.tlog-line { white-space: pre-wrap; word-break: break-word; }\n.tlog-time { color: var(--text-dim); margin-right: 8px; }\n.tlog-info    { color: var(--text-primary); }\n.tlog-muted   { color: var(--text-secondary); }\n.tlog-ok      { color: var(--ok); }\n.tlog-warn    { color: var(--warn); }\n.tlog-err     { color: var(--err); }\n.tlog-running { color: var(--running); }\n.tlog-header-line { color: var(--accent-gold); }\n.tlog-fallback { color: #f59edb; }\n\n/* push workspace up so terminal bar doesn\'t overlap content */\nbody { padding-bottom: 32px; }\n\n</style>\n</head>\n<body>\n\n<div class="header">\n    <div class="logo-wrap">\n        <a href="https://thedistrictzero.com/" target="_blank" rel="noopener" style="display:flex;align-items:center;line-height:0;"><img class="logo-img" src="https://cdn.jsdelivr.net/gh/Gerry-Malta/Prompt_Studio@main/DZ_logo_color_transparent_s.png" alt="District Zero" onerror="this.style.display=\'none\'"></a>\n        <div class="logo-div"></div>\n        <span class="logo-sub">AI Lab</span>\n        <div class="logo-div"></div>\n        <span class="logo-module">Wedge Studio</span>\n        <div class="logo-div"></div>\n        <span class="logo-ver" id="logoVer">v002</span>\n    </div>\n    <div class="header-right">\n        <div class="cfg">\n            <label>Server</label>\n            <input id="server" value="127.0.0.1:8188" size="14">\n        </div>\n        <div class="cfg">\n            <label>Timeout(min)</label>\n            <input id="timeout" value="20" size="3">\n        </div>\n        <div class="cfg" id="comfyPathCfg" style="display:none;">\n            <label>ComfyUI folder</label>\n            <input id="comfyPath" placeholder="D:\\ComfyUI" size="20" title="Path to your ComfyUI folder (for auto-restart)">\n            <button class="btn btn-sm" onclick="saveComfyPath()" title="Save path">✓</button>\n        </div>\n        <span class="mode-pill planning" id="modePill">Checking…</span>\n    </div>\n</div>\n\n</div>\n\n<div class="workspace">\n    <!-- AVAILABLE -->\n    <div class="col col-avail">\n        <div class="col-head"><span>Workflows · click in order to chain</span></div>\n        <div id="serverFolderRow" style="display:none;padding:0 12px 8px;">\n            <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Workflow folder path</div>\n            <div style="display:flex;gap:6px;">\n                <input id="folderPathInput" placeholder="D:\\your\\workflow\\folder" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border-secondary);color:var(--text-primary);font-family:inherit;font-size:11px;padding:6px 8px;border-radius:3px;outline:none;">\n                <button class="btn btn-sm" onclick="openFolderBrowser()" title="Browse folders">&#128193;</button>\n                <button class="btn btn-sm" onclick="loadFromServer()">Load</button>\n            </div>\n        </div>\n\n        <!-- folder browser modal -->\n        <div class="folder-browser" id="folderBrowser">\n            <div class="fb-panel">\n                <div class="fb-head">\n                    <span class="fb-title">Select Workflow Folder</span>\n                    <button class="btn btn-sm" onclick="closeFolderBrowser()">✕</button>\n                </div>\n                <div class="fb-breadcrumb" id="fbBreadcrumb"></div>\n                <div class="fb-list" id="fbList"></div>\n                <div class="fb-foot">\n                    <span class="fb-current-path" id="fbCurrentPath"></span>\n                    <span class="fb-json-count" id="fbJsonCount"></span>\n                    <button class="btn btn-sm btn-primary" id="fbSelectBtn" onclick="selectFolderFromBrowser()">Select this folder</button>\n                    <button class="btn btn-sm" onclick="closeFolderBrowser()">Cancel</button>\n                </div>\n            </div>\n        </div>\n        <div class="dropzone" id="dropzone" onclick="document.getElementById(\'fileInput\').click()">\n            Drag &amp; drop a folder<br>or click to choose .json files\n        </div>\n        <div class="col-body">\n            <div class="sel-info" id="selInfo">selected: (none)</div>\n            <div class="sel-row">\n                <button class="btn btn-sm" onclick="makeChain()">Make Chain</button>\n                <button class="btn btn-sm" onclick="addSingles()">Add Singles</button>\n                <button class="btn btn-sm" onclick="clearSel()">Clear</button>\n            </div>\n            <div id="availList"></div>\n            <input type="file" id="fileInput" accept=".json" multiple webkitdirectory directory style="display:none">\n        </div>\n    </div>\n\n    <!-- RUN ORDER -->\n    <div class="col col-order">\n        <div class="col-head">\n            <span>Run Order · drag to reorder</span>\n            <button class="btn btn-sm btn-danger" onclick="removeSelectedUnit()" title="Remove selected row">✕ Remove selected</button>\n        </div>\n        <div class="col-body" id="orderList"></div>\n    </div>\n\n    <!-- MAIN -->\n    <div class="col col-main">\n        <div class="graph-wrap">\n            <div class="graph-title" id="graphTitle">Chain Graph · click a chain to flip its mode</div>\n            <div id="graph"></div>\n        </div>\n        <div class="log-wrap" style="display:none;">\n            <div class="log" id="log"></div>\n        </div>\n        <div class="compare-bar" id="compareBar">\n    <strong id="compareCount">0 selected</strong>\n    &nbsp;·&nbsp; click thumbnails to select for compare (max 2)\n    <button class="btn btn-sm" id="compareBtn" onclick="openWipe()" style="margin-left:auto;" disabled>⇌ Compare</button>\n    <button class="btn btn-sm" onclick="clearCompare()">Clear</button>\n    <button class="btn btn-sm" id="exportReportBtn" onclick="exportReport()">↓ Export Report</button>\n</div>\n\n<!-- standard lightbox -->\n<div class="lightbox" id="lightbox">\n    <button class="lb-close" onclick="lbClose()">✕</button>\n    <button class="lb-nav lb-prev" onclick="lbNav(-1)">&#8592;</button>\n    <button class="lb-nav lb-next" onclick="lbNav(1)">&#8594;</button>\n    <div class="lb-counter" id="lbCounter"></div>\n    <div class="lb-content" id="lbContent"></div>\n    <div class="lb-meta" id="lbMeta"></div>\n</div>\n\n<!-- wipe compare lightbox -->\n<div class="wipe-lb" id="wipeLb">\n    <button class="lb-close" onclick="wipeClose()">✕</button>\n    <div class="wipe-wrap" id="wipeWrap">\n        <div class="wipe-b" id="wipeB"></div>\n        <div class="wipe-a" id="wipeA"></div>\n        <div class="wipe-handle" id="wipeHandle"></div>\n        <div class="wipe-labels">\n            <span class="wipe-lbl a" id="wipeLblA"></span>\n            <span class="wipe-lbl b" id="wipeLblB"></span>\n        </div>\n    </div>\n    <div class="wipe-controls">\n        <div class="wipe-controls-row">\n            <button class="btn btn-sm" id="wipePlayBtn" onclick="wipeTogglePlay()">▶ Play</button>\n        </div>\n        <div class="wipe-scrubber" id="wipeScrubber">\n            <div class="scrub-track" id="scrubTrack">\n                <div class="scrub-fill" id="scrubFill"></div>\n                <div class="scrub-needle" id="scrubNeedle"></div>\n            </div>\n            <span class="scrub-label" id="scrubLabel">frame —</span>\n        </div>\n        <div class="scrub-cfg">\n            <label>fps</label>\n            <input id="scrubFps" type="number" value="30" min="1" max="120"\n                oninput="wipeDetectedFps=parseInt(this.value)||30; scrubFromVideo();"\n                title="Set fps to correct the frame number display">\n            <label>speed</label>\n            <div class="speed-btns">\n                <button class="speed-btn" onclick="setWipeSpeed(0.1)" title="10% speed">×0.1</button>\n                <button class="speed-btn" onclick="setWipeSpeed(0.25)" title="25% speed">×0.25</button>\n                <button class="speed-btn" onclick="setWipeSpeed(0.5)" title="50% speed">×0.5</button>\n                <button class="speed-btn active" id="speedBtn1" onclick="setWipeSpeed(1)" title="Normal speed">×1</button>\n            </div>\n        </div>\n    </div>\n</div>\n\n<div class="results">\n            <div class="section-label" style="padding:0 0 8px">Results · click to play · hover for compare select · ← → keys navigate</div>\n            <div class="results-grid" id="results"></div>\n        </div>\n        <div class="pbars">\n            <div class="pbar-row">\n                <span class="pbar-lbl">Job</span>\n                <div class="pbar-track"><div class="pbar-fill job" id="jobFill"></div></div>\n                <span class="pbar-pct" id="jobPct"></span>\n            </div>\n            <div class="pbar-row">\n                <span class="pbar-lbl">Batch</span>\n                <div class="pbar-track"><div class="pbar-fill batch" id="batchFill"></div></div>\n                <span class="pbar-pct" id="batchPct"></span>\n            </div>\n            <div class="pbar-row" style="margin-top:10px; justify-content:flex-end; gap:8px;">\n                <span id="progressText" style="flex:1; font-size:9px; color:var(--text-dim); letter-spacing:.1em;"></span>\n                <button class="btn btn-sm" id="runBtn" onclick="startRun()" disabled>▶ Run</button>\n                <button class="btn btn-sm" id="stopBtn" onclick="stopRun()" disabled>■ Stop</button>\n            </div>\n        </div>\n    </div>\n</div>\n\n<script>\n// ============ baked-in plan (filled on download from web) ============\nconst BAKED_PLAN = null; // when not null: {order:[...], server, timeout}\n\n// ============ state ============\nconst OUTPUT_NODE_TYPES = {\n    "SaveVideo": "filename_prefix",\n    "VHS_VideoCombine": "filename_prefix",\n    "SaveImage": "filename_prefix",\n    "SaveAudio": "filename_prefix",\n};\nlet workflows = {};      // name -> {wf, validApi}    (wf may be null when loaded from plan only)\nlet order = [];          // run units\nlet chainSel = [];\nlet selUnit = null;\nlet clientId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random());\nlet running = false;\nlet stopFlag = false;\nlet dragIdx = null;\nlet comfyOnline = false;\nlet _pendingSavedOrder = null;  // order restored from _wedge_config.json at startup\nlet folderName = \'wedge\';\nlet serverFolder = null;   // set when served from wedge_studio.py\nconst WEDGE_SERVER = (location.protocol !== \'file:\') ? location.origin : null;\n// when running from wedge_studio.py, proxy ComfyUI calls through our server\n// so browser never needs to make cross-origin requests to port 8188\nconst comfyBase = () => WEDGE_SERVER ? WEDGE_SERVER + \'/comfy_proxy\' : base();\n\nconst server = () => document.getElementById(\'server\').value.trim() || \'127.0.0.1:8188\';\nconst base = () => \'http://\' + server();\n\n// ============ helpers ============\nfunction isApiFormat(wf){\n    if (!wf || typeof wf !== \'object\') return false;\n    if (Array.isArray(wf.nodes)) return false;\n    return Object.values(wf).some(v => v && typeof v === \'object\' && \'class_type\' in v);\n}\nfunction rewritePrefix(wf, prefix){\n    let n = 0;\n    for (const node of Object.values(wf)){\n        if (!node || typeof node !== \'object\') continue;\n        const key = OUTPUT_NODE_TYPES[node.class_type];\n        if (key && node.inputs && key in node.inputs){ node.inputs[key] = \'wedge/\' + prefix; n++; }\n    }\n    return n;\n}\n// tag → {css class, dot colour}\nconst LOG_TAGS = {\n    \'info\':        {cls:\'tlog-info\',        dot:\'#e8e4dc\'},\n    \'muted\':       {cls:\'tlog-muted\',       dot:\'#555550\'},\n    \'ok\':          {cls:\'tlog-ok\',          dot:\'#5ad17a\'},\n    \'warn\':        {cls:\'tlog-warn\',        dot:\'#f0b656\'},\n    \'err\':         {cls:\'tlog-err\',         dot:\'#ff6b6b\'},\n    \'running\':     {cls:\'tlog-running\',     dot:\'#6ea8fe\'},\n    \'header-line\': {cls:\'tlog-header-line\', dot:\'#d18d1f\'},\n    \'fallback\':    {cls:\'tlog-fallback\',    dot:\'#f59edb\'},\n};\nfunction log(msg, tag=\'info\'){\n    const ts = new Date().toLocaleTimeString(\'en-GB\');\n    // legacy hidden div (keeps existing code that reads #log working)\n    const legEl = document.getElementById(\'log\');\n    if (legEl){\n        const l = document.createElement(\'div\');\n        l.innerHTML = \'<span class="ts">[\'+ts+\']</span> <span class="\'+tag+\'">\'+escapeHtml(msg)+\'</span>\';\n        legEl.appendChild(l);\n    }\n    // terminal panel\n    const tb = document.getElementById(\'terminal-body\');\n    if (tb){\n        const t = LOG_TAGS[tag] || {cls:\'tlog-muted\', dot:\'#555550\'};\n        const line = document.createElement(\'div\');\n        line.className = \'tlog-line\';\n        line.innerHTML = \'<span class="tlog-time">[\'+ts+\']</span><span class="\'+t.cls+\'">\'+escapeHtml(msg)+\'</span>\';\n        tb.appendChild(line);\n        tb.scrollTop = tb.scrollHeight;\n        // dot: colour + blink on err/running, solid flash otherwise\n        const dot = document.getElementById(\'terminal-dot\');\n        if (dot){\n            dot.style.background = t.dot;\n            dot.classList.remove(\'blink\');\n            dot.classList.add(\'active\');\n            if (tag === \'err\' || tag === \'running\') dot.classList.add(\'blink\');\n            else setTimeout(() => { dot.classList.remove(\'active\'); }, 2000);\n        }\n        // auto-open terminal on first log entry if collapsed\n        const term = document.getElementById(\'terminal\');\n        if (term && term.classList.contains(\'collapsed\')){\n            // just flash the dot — don\'t auto-open, let user decide\n        }\n    }\n}\nfunction toggleTerminal(){\n    const term = document.getElementById(\'terminal\');\n    term.classList.toggle(\'collapsed\');\n    term.classList.toggle(\'open\');\n    if (term.classList.contains(\'collapsed\')){\n        term.style.height = \'\';\n    } else if (!term.style.height){\n        term.style.height = \'220px\';\n    }\n}\nfunction clearTerminal(){\n    const tb = document.getElementById(\'terminal-body\');\n    if (tb) tb.innerHTML = \'\';\n    const dot = document.getElementById(\'terminal-dot\');\n    if (dot){ dot.classList.remove(\'active\',\'blink\'); }\n    log(\'Log cleared.\', \'muted\');\n}\n// resize drag — exact Blueprint Builder implementation\n(function(){\n    let isResizing = false, startY = 0, startHeight = 0, mouseHasMoved = false;\n    // wait for DOM ready\n    function initTermResize(){\n        const terminal = document.getElementById(\'terminal\');\n        const termBar  = document.getElementById(\'terminal-bar\');\n        if (!terminal || !termBar) return;\n\n        termBar.addEventListener(\'mousedown\', (e) => {\n            if (e.target.closest(\'#terminal-actions\')) return;\n            const rect = termBar.getBoundingClientRect();\n            const edgeDistance = e.clientY - rect.top;\n            if (edgeDistance <= 4 && terminal.classList.contains(\'open\')) {\n                isResizing = true;\n                mouseHasMoved = false;\n                startY = e.clientY;\n                startHeight = terminal.offsetHeight;\n                e.preventDefault();\n                e.stopPropagation();\n            }\n        });\n\n        document.addEventListener(\'mousemove\', (e) => {\n            if (!isResizing) return;\n            mouseHasMoved = true;\n            terminal.classList.add(\'resizing\');\n            document.body.style.cursor = \'ns-resize\';\n            const deltaY = startY - e.clientY;\n            const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + deltaY));\n            terminal.style.height = newHeight + \'px\';\n            e.preventDefault();\n        });\n\n        document.addEventListener(\'mouseup\', (e) => {\n            if (!isResizing) return;\n            isResizing = false;\n            terminal.classList.remove(\'resizing\');\n            document.body.style.cursor = \'\';\n            if (mouseHasMoved) {\n                termBar.dataset.justResized = \'true\';\n                setTimeout(() => { delete termBar.dataset.justResized; }, 100);\n                e.preventDefault();\n                e.stopPropagation();\n            }\n            mouseHasMoved = false;\n        });\n\n        // click to toggle — separate from mousedown, checks justResized\n        termBar.addEventListener(\'click\', (e) => {\n            if (e.target.closest(\'#terminal-actions\')) return;\n            if (termBar.dataset.justResized === \'true\') return;\n            toggleTerminal();\n        });\n    }\n    if (document.readyState === \'loading\')\n        document.addEventListener(\'DOMContentLoaded\', initTermResize);\n    else\n        initTermResize();\n})();\nfunction escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({\'&\':\'&amp;\',\'<\':\'&lt;\',\'>\':\'&gt;\'}[c])); }\nconst sleep = ms => new Promise(r => setTimeout(r, ms));\n\n// Clear ComfyUI VRAM (unload models + free memory)\nasync function freeVram(){\n    try {\n        log(\'    \\u21ba Clearing VRAM\\u2026\', \'muted\');\n        const _freeResp = await fetch(comfyBase() + \'/free\', {\n            method: \'POST\', headers: {\'Content-Type\':\'application/json\'},\n            body: JSON.stringify({unload_models: true, free_memory: true})\n        });\n        if (!_freeResp.ok) {\n            log(\'    VRAM clear failed: HTTP \' + _freeResp.status + \' \\u2014 /free endpoint missing or errored\', \'warn\');\n        } else {\n            log(\'    \\u2713 VRAM cleared.\', \'ok\');\n        }\n    } catch(e){\n        log(\'    VRAM clear failed: \' + e.message, \'warn\');\n    }\n}\n\n// ============ mode detection ============\n// All ComfyUI calls are proxied through /comfy_proxy when running via\n// _wedge_studio.py, so there are no cross-origin requests and no CORS\n// issues to detect or handle here.\nasync function checkComfy(){\n    const pill = document.getElementById(\'modePill\');\n    try {\n        const ctrl = new AbortController();\n        const t = setTimeout(() => ctrl.abort(), 3500);\n        const r = await fetch(comfyBase() + \'/system_stats\', {signal: ctrl.signal});\n        clearTimeout(t);\n        if (r.ok){\n            comfyOnline = true;\n            pill.className   = \'mode-pill local-ok\';\n            pill.textContent = \'\\u25cf Local \\u00b7 ComfyUI online\';\n            updateRunButton();\n            return true;\n        }\n    } catch(e){}\n    comfyOnline = false;\n    pill.className   = \'mode-pill local-bad\';\n    pill.textContent = \'COMFYUI OFFLINE\';\n    updateRunButton();\n    return false;\n}\nsetInterval(checkComfy, 6000);\n\nfunction updateRunButton(){\n    const btn = document.getElementById(\'runBtn\');\n    btn.disabled = !comfyOnline || running || !order.length;\n    btn.classList.toggle(\'btn-primary\', comfyOnline && order.length > 0);\n}\n\n// ============ load files (folder drag-drop or picker) ============\nconst dropzone = document.getElementById(\'dropzone\');\n[\'dragenter\',\'dragover\'].forEach(ev => dropzone.addEventListener(ev, e => {e.preventDefault(); dropzone.classList.add(\'over\');}));\n[\'dragleave\',\'drop\'].forEach(ev => dropzone.addEventListener(ev, e => {e.preventDefault(); dropzone.classList.remove(\'over\');}));\n// Also accept drops on the page so big-target gestures work\ndocument.addEventListener(\'dragover\', e => e.preventDefault());\ndropzone.addEventListener(\'drop\', async (e) => {\n    const items = e.dataTransfer.items;\n    if (!items) return;\n    const collected = [];\n    const promises = [];\n    for (const item of items){\n        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();\n        if (entry){ promises.push(walkEntry(entry, collected)); }\n        else if (item.kind === \'file\'){\n            const f = item.getAsFile();\n            if (f && f.name.toLowerCase().endsWith(\'.json\')) collected.push(f);\n        }\n    }\n    await Promise.all(promises);\n    await ingestFiles(collected);\n});\n\nfunction walkEntry(entry, acc){\n    return new Promise((resolve) => {\n        if (entry.isFile){\n            if (entry.name.toLowerCase().endsWith(\'.json\')){\n                entry.file(f => { acc.push(f); resolve(); }, () => resolve());\n            } else resolve();\n        } else if (entry.isDirectory){\n            const reader = entry.createReader();\n            const readBatch = () => reader.readEntries(async (entries) => {\n                if (!entries.length) return resolve();\n                await Promise.all(entries.map(e => walkEntry(e, acc)));\n                readBatch();\n            }, () => resolve());\n            readBatch();\n        } else resolve();\n    });\n}\n\ndocument.getElementById(\'fileInput\').addEventListener(\'change\', async (e) => {\n    await ingestFiles([...e.target.files]);\n    e.target.value = \'\';\n});\n\nasync function ingestFiles(files){\n    if (!files || !files.length) return;\n    // capture folder name from the first file\'s path (webkitRelativePath gives folder/file.json)\n    if (files[0]) {\n        const rel = files[0].webkitRelativePath || files[0].name;\n        const parts = rel.split(\'/\');\n        if (parts.length > 1) folderName = parts[0];\n        else folderName = \'wedge\';\n    }\n    let okN = 0, invalidN = 0;\n    for (const f of files){\n        if (!f.name.toLowerCase().endsWith(\'.json\')) continue;\n        const name = f.name.replace(/\\.json$/i, \'\');\n        try {\n            const text = await f.text();\n            const wf = JSON.parse(text);\n            if (isApiFormat(wf)){ workflows[name] = {wf, validApi:true}; okN++; }\n            else { workflows[name] = {wf:null, validApi:false}; invalidN++; }\n        } catch(err){ workflows[name] = {wf:null, validApi:false}; invalidN++; }\n    }\n    // add as singles if not already in order\n    const existing = new Set();\n    for (const u of order){ if (u.type===\'single\') existing.add(u.name); else u.names.forEach(n=>existing.add(n)); }\n    for (const name of Object.keys(workflows)){\n        if (!existing.has(name)) order.push({type:\'single\', name});\n    }\n    if (okN) log(`Loaded ${okN} workflow(s).`, \'muted\');\n    if (invalidN) log(`${invalidN} file(s) skipped (not API format).`, \'warn\');\n    renderAvail(); renderOrder(); renderGraph(); updateRunButton();\n}\n\n// ============ available list ============\nfunction renderAvail(){\n    const el = document.getElementById(\'availList\');\n    el.innerHTML = \'\';\n    for (const name of Object.keys(workflows)){\n        const meta = workflows[name];\n        const div = document.createElement(\'div\');\n        const sel = chainSel.includes(name);\n        const cls = [\'wf-item\', sel && \'selected\', !meta.validApi && \'invalid\'].filter(Boolean).join(\' \');\n        div.className = cls;\n        const seq = sel ? (chainSel.indexOf(name)+1) : \'\';\n        const label = name + (meta.validApi ? \'\' : \'  · not API format\');\n        div.innerHTML = `<span class="seq">${seq}</span><span>${escapeHtml(label)}</span>`;\n        div.onclick = () => { if (meta.validApi) toggleSel(name); else log(`\'${name}\' is not API format — re-save with "Save (API Format)" in ComfyUI.`, \'warn\'); };\n        el.appendChild(div);\n    }\n    const txt = chainSel.length ? chainSel.join(\'  →  \') : \'(none)\';\n    document.getElementById(\'selInfo\').textContent = \'selected: \' + txt;\n}\nfunction toggleSel(name){\n    const i = chainSel.indexOf(name);\n    if (i >= 0) chainSel.splice(i,1); else chainSel.push(name);\n    renderAvail();\n}\nfunction clearSel(){ chainSel = []; renderAvail(); }\n\nfunction purgeNames(names){\n    const out = [];\n    for (const u of order){\n        if (u.type === \'single\'){ if (!names.includes(u.name)) out.push(u); }\n        else {\n            const kept = u.names.filter(n => !names.includes(n));\n            if (kept.length >= 2){ u.names = kept; out.push(u); }\n            else if (kept.length === 1){ out.push({type:\'single\', name:kept[0]}); }\n        }\n    }\n    order = out;\n}\nfunction makeChain(){\n    if (chainSel.length < 2){ alert(\'Click at least two workflows (in order) to make a chain.\'); return; }\n    const names = [...chainSel];\n    purgeNames(names);\n    order.push({type:\'chain\', names, mode:\'success\'});\n    clearSel(); renderOrder(); renderGraph(); updateRunButton();\n}\nfunction addSingles(){\n    if (!chainSel.length) return;\n    const names = [...chainSel];\n    purgeNames(names);\n    for (const n of names) order.push({type:\'single\', name:n});\n    clearSel(); renderOrder(); renderGraph(); updateRunButton();\n}\n\n// ============ run order (drag) ============\nfunction renderOrder(){\n    const el = document.getElementById(\'orderList\');\n    el.innerHTML = \'\';\n    order.forEach((u, i) => {\n        const div = document.createElement(\'div\');\n        div.className = \'unit\' + (u.type===\'chain\'?\' chain\':\'\') + (selUnit===i?\' selected\':\'\');\n        div.dataset.unitIdx = i;\n        if (u.type===\'single\') div.dataset.name = u.name;\n        div.draggable = true;\n        let inner;\n        if (u.type === \'single\'){\n            inner = `<span class="idx">${i+1}</span><span class="ico">○</span><span class="lbl">${escapeHtml(u.name)}</span>`;\n        } else {\n            const tag = u.mode === \'success\' ? \'success\' : \'failure\';\n            const tagtxt = u.mode === \'success\' ? \'✓ succ\' : \'✗ fail\';\n            inner = `<span class="idx">${i+1}</span><span class="ico">⛓</span><span class="lbl">${escapeHtml(u.names.join(\' → \'))}</span><span class="mode-tag ${tag}">${tagtxt}</span>`;\n        }\n        div.innerHTML = inner;\n        // ✕ remove button on each row\n        const xBtn = document.createElement(\'span\');\n        xBtn.textContent = \'✕\';\n        xBtn.title = \'Remove from run list\';\n        xBtn.style.cssText = \'margin-left:auto;padding:0 6px;color:var(--text-dim);cursor:pointer;font-size:11px;flex-shrink:0;\';\n        xBtn.addEventListener(\'mouseenter\', () => xBtn.style.color = \'var(--err)\');\n        xBtn.addEventListener(\'mouseleave\', () => xBtn.style.color = \'var(--text-dim)\');\n        xBtn.addEventListener(\'click\', (e) => { e.stopPropagation(); removeUnit(i); });\n        div.appendChild(xBtn)\n        // VRAM clear checkbox\n        const vramWrap = document.createElement(\'label\');\n        vramWrap.className = \'vram-cb\' + (u.clearVram ? \' on\' : \'\');\n        vramWrap.title = \'Clear VRAM after this workflow\';\n        vramWrap.addEventListener(\'click\', e => e.stopPropagation());\n        const vramChk = document.createElement(\'input\');\n        vramChk.type = \'checkbox\'; vramChk.checked = !!u.clearVram;\n        vramChk.addEventListener(\'change\', e => {\n            u.clearVram = e.target.checked;\n            vramWrap.classList.toggle(\'on\', u.clearVram);\n        });\n        vramWrap.appendChild(vramChk);\n        vramWrap.appendChild(Object.assign(document.createElement(\'span\'), {textContent:\'VRAM\'}));\n        div.insertBefore(vramWrap, xBtn);;\n        div.onclick = () => { selUnit = i; renderOrder(); };\n        div.addEventListener(\'dragstart\', e => { dragIdx = i; div.classList.add(\'dragging\'); });\n        div.addEventListener(\'dragend\',  e => { div.classList.remove(\'dragging\'); document.querySelectorAll(\'.unit\').forEach(u=>u.classList.remove(\'drag-over\')); });\n        div.addEventListener(\'dragover\', e => { e.preventDefault(); div.classList.add(\'drag-over\'); });\n        div.addEventListener(\'dragleave\',e => { div.classList.remove(\'drag-over\'); });\n        div.addEventListener(\'drop\', e => {\n            e.preventDefault();\n            div.classList.remove(\'drag-over\');\n            if (dragIdx === null || dragIdx === i) return;\n            const moved = order.splice(dragIdx, 1)[0];\n            order.splice(i, 0, moved);\n            selUnit = i; dragIdx = null;\n            renderOrder(); renderGraph();\n        });\n        el.appendChild(div);\n    });\n    if (!order.length) el.innerHTML = \'<div class="empty-hint">No units yet.<br>Drag a folder onto the left dropzone, then arrange chains/order here.</div>\';\n}\nfunction removeSelectedUnit(){\n    if (selUnit === null || selUnit >= order.length) return;\n    order.splice(selUnit, 1);\n    selUnit = null; renderOrder(); renderGraph(); updateRunButton();\n}\nfunction removeUnit(i){\n    order.splice(i, 1);\n    if (selUnit === i) selUnit = null;\n    else if (selUnit > i) selUnit--;\n    renderOrder(); renderGraph(); updateRunButton();\n}\n\n// ============ graph ============\nlet nodeEls = {};\nfunction renderGraph(){\n    const g = document.getElementById(\'graph\');\n    g.innerHTML = \'\'; nodeEls = {};\n    const chains = order.map((u,i)=>({u,i})).filter(x => x.u.type===\'chain\');\n    const title = document.getElementById(\'graphTitle\');\n    if (!chains.length){ title.textContent = \'Chain Graph · make a chain to see it here\'; return; }\n    title.textContent = \'Chain Graph · click a chain to flip mode · grey=pending blue=running green=ok red=fail\';\n    for (const {u,i} of chains){\n        const row = document.createElement(\'div\');\n        row.className = \'chain-row\';\n        row.onclick = () => { u.mode = u.mode===\'success\'?\'failure\':\'success\'; renderOrder(); renderGraph(); };\n        const mode = document.createElement(\'span\');\n        mode.className = \'chain-mode \' + u.mode;\n        mode.textContent = u.mode===\'success\' ? \'✓ stop on success\' : \'✗ stop on fail\';\n        row.appendChild(mode);\n        u.names.forEach((nm, ni) => {\n            const node = document.createElement(\'span\');\n            node.className = \'gnode\'; node.dataset.name = nm;\n            // name label\n            const gnLbl = document.createElement(\'span\');\n            gnLbl.className = \'gnode-lbl\'; gnLbl.textContent = nm;\n            node.appendChild(gnLbl);\n            // per-node VRAM checkbox\n            const gnVramWrap = document.createElement(\'label\');\n            const gnVramOn = u.nodeVram && u.nodeVram[nm];\n            gnVramWrap.className = \'vram-cb\' + (gnVramOn ? \' on\' : \'\');\n            gnVramWrap.title = \'Clear VRAM after this node\';\n            gnVramWrap.addEventListener(\'click\', e => e.stopPropagation());\n            const gnVramChk = document.createElement(\'input\');\n            gnVramChk.type = \'checkbox\'; gnVramChk.checked = !!gnVramOn;\n            gnVramChk.addEventListener(\'change\', e => {\n                if (!u.nodeVram) u.nodeVram = {};\n                u.nodeVram[nm] = e.target.checked;\n                gnVramWrap.classList.toggle(\'on\', e.target.checked);\n            });\n            gnVramWrap.appendChild(gnVramChk);\n            gnVramWrap.appendChild(Object.assign(document.createElement(\'span\'), {textContent:\'VRAM\'}));\n            node.appendChild(gnVramWrap);\n            row.appendChild(node);\n            (nodeEls[nm] = nodeEls[nm] || []).push(node);\n            if (ni < u.names.length-1){\n                const a = document.createElement(\'span\'); a.className=\'garrow\'; a.textContent=\'→\'; row.appendChild(a);\n            }\n        });\n        g.appendChild(row);\n    }\n}\nfunction colorNode(name, state, reused){\n    (nodeEls[name]||[]).forEach(el => {\n        el.className = \'gnode \' + state + (reused ? \' reused\' : \'\');\n    });\n    // also highlight the unit row in the order list\n    document.querySelectorAll(`.unit[data-name="${CSS.escape(name)}"]`).forEach(el => {\n        el.classList.remove(\'running\',\'ok\',\'fail\');\n        if (state && state !== \'pending\') el.classList.add(state);\n    });\n}\n\nfunction colorChainUnit(unitIdx, state){\n    const el = document.querySelector(`.unit[data-unit-idx="${unitIdx}"]`);\n    if (!el) return;\n    el.classList.remove(\'running\',\'ok\',\'fail\');\n    if (state) el.classList.add(state);\n}\n\n// ============ download local copy with baked plan ============\nasync function downloadLocalCopy(){\n    if (!order.length){ alert(\'Build a plan first (add workflows and arrange them).\'); return; }\n    // Confirm at least one workflow has actual content (else local file can\'t run them)\n    const hasContent = Object.values(workflows).some(w => w && w.validApi && w.wf);\n    if (!hasContent){\n        if (!confirm(\'You haven\\\'t loaded any workflow content yet — the downloaded file will have your PLAN but no workflows baked in. On the target machine you\\\'ll need to drag the workflow folder again. Continue?\')) return;\n    }\n    // Build the baked plan\n    const plan = {\n        order: JSON.parse(JSON.stringify(order)),\n        server: document.getElementById(\'server\').value.trim(),\n        timeout: parseFloat(document.getElementById(\'timeout\').value) || 20,\n        workflows: {}\n    };\n    for (const [name, meta] of Object.entries(workflows)){\n        if (meta && meta.validApi && meta.wf) plan.workflows[name] = meta.wf;\n    }\n    // Fetch this very page and inject the plan as BAKED_PLAN\n    let pageHtml;\n    try {\n        const r = await fetch(window.location.href);\n        pageHtml = await r.text();\n    } catch(e){\n        // Fallback: use the live document — works when opened from file://\n        pageHtml = \'<!DOCTYPE html>\\n\' + document.documentElement.outerHTML;\n    }\n    const planJs = \'const BAKED_PLAN = \' + JSON.stringify(plan).replace(/<\\/script/gi, \'<\\\\/script\') + \';\';\n    const out = pageHtml.replace(/const BAKED_PLAN = null;/, planJs);\n\n    const stamp = new Date().toISOString().replace(/[:.]/g,\'-\').slice(0,19);\n    const blob = new Blob([out], {type:\'text/html;charset=utf-8\'});\n    const a = document.createElement(\'a\');\n    a.href = URL.createObjectURL(blob);\n    a.download = `wedge_studio_${stamp}.html`;\n    document.body.appendChild(a); a.click(); a.remove();\n    setTimeout(() => URL.revokeObjectURL(a.href), 5000);\n    log(`Downloaded local copy with ${Object.keys(plan.workflows).length} workflow(s) baked in.`, \'ok\');\n}\n\n// ============ run engine ============\nasync function startRun(){\n    if (running) return;\n    if (!comfyOnline){\n        alert(\'ComfyUI is offline.\\n\\nStart it with:\\n  python main.py --enable-cors-header "*"\\n\\nThen this page will switch to Local mode automatically.\');\n        return;\n    }\n    if (!order.length){ alert(\'Build a plan first.\'); return; }\n    // sanity: every name in order must have a loaded workflow\n    const missing = [];\n    for (const u of order){\n        const names = u.type===\'single\' ? [u.name] : u.names;\n        for (const n of names) if (!workflows[n] || !workflows[n].validApi || !workflows[n].wf) missing.push(n);\n    }\n    if (missing.length){\n        alert(`Missing workflow content for: ${[...new Set(missing)].join(\', \')}\\n\\nDrag the folder containing these .json files onto the dropzone to load them.`);\n        return;\n    }\n\n    // ── save config (_wedge_config.json) before running ─────────────────────\n    if (WEDGE_SERVER) {\n        const _cpEl = document.getElementById(\'comfyPath\');\n        const _cfg = {\n            timeout: parseFloat(document.getElementById(\'timeout\').value) || 20,\n            order: JSON.parse(JSON.stringify(order))\n        };\n        if (_cpEl && _cpEl.value.trim()) _cfg.comfy_path = _cpEl.value.trim();\n        fetch(WEDGE_SERVER+\'/save_config\', {\n            method: \'POST\',\n            headers: {\'Content-Type\': \'application/json\'},\n            body: JSON.stringify(_cfg)\n        }).catch(()=>{});\n        log(\'✓ Config saved to _wedge_config.json\', \'muted\');\n    }\n    running = true; stopFlag = false;\n    document.getElementById(\'runBtn\').disabled = true;\n    document.getElementById(\'stopBtn\').disabled = false;\n    document.getElementById(\'results\').innerHTML = \'\';\n    setBar(\'job\',0); setBar(\'batch\',0);\n    sessionResults = {};\n    renderGraph();\n    // reset any leftover run-state colours on unit rows\n    document.querySelectorAll(\'.unit\').forEach(el => el.classList.remove(\'running\',\'ok\',\'fail\'));\n\n    const timeoutS = Math.max(10, (parseFloat(document.getElementById(\'timeout\').value)||20)*60);\n    log(`Batch: ${order.length} unit(s) | timeout ${(timeoutS/60).toFixed(0)} min`, \'header-line\');\n\n    let okCount = 0;\n    for (let i=0; i<order.length; i++){\n        if (stopFlag){ log(\'Stopped by user.\', \'warn\'); break; }\n        const u = order[i];\n        const head = u.type===\'single\' ? u.name : u.names[0];\n        setBar(\'batch\', i/order.length*100); document.getElementById(\'batchPct\').textContent = `${i+1}/${order.length}`;\n        document.getElementById(\'progressText\').textContent = `Running ${i+1}/${order.length}: ${head}`;\n        const jobTimeoutS = (u.timeout && u.timeout > 0) ? u.timeout * 60 : timeoutS;\n        if (u.timeout && u.timeout > 0)\n            log(`\\u2500 Job ${i+1}/${order.length}: ${head}  [timeout: ${u.timeout}min]`, \'muted\');\n        else\n            log(`\\\\u2500 Job ${i+1}/${order.length}: ${head}`, \'muted\');\n        let res;\n        try {\n            if (u.type===\'single\'){\n                res = await runLink(u.name, head, jobTimeoutS);\n            } else {\n                colorChainUnit(i, \'running\');\n                const chainResults = await runChainAll(u, jobTimeoutS);\n                let chainOk = false;\n                chainResults.forEach(cr => { if (cr.ok) chainOk = true; });\n                colorChainUnit(i, chainOk ? \'ok\' : \'fail\');\n                if (chainOk) okCount++;\n                res = chainResults[chainResults.length - 1] || {ok:false,status:\'error\',secs:0,outs:[]};\n                // add result cards for chain (separate try so DOM errors don\'t hide results)\n                chainResults.forEach(cr => {\n                    try { addResult(cr.used || cr.name, cr); } catch(e){ console.error(\'addResult error:\', e); }\n                });\n                // clear VRAM after the whole chain if the unit checkbox is on\n                if (u.clearVram) await freeVram();\n            }\n        } catch(jobErr) {\n            log(\'    Run error in job \' + (i+1) + \': \' + jobErr.message, \'err\');\n            console.error(\'Job run error:\', jobErr);\n            if (!res) res = {ok:false, status:\'error\', secs:0, outs:[]};\n        }\n        // add result card for single (separate try)\n        if (u.type===\'single\' && res){\n            if (res.ok) okCount++;\n            try { addResult(res.used || head, res); } catch(e){ console.error(\'addResult error:\', e); }\n            // clear VRAM after this single unit if the checkbox is on\n            if (u.clearVram) await freeVram();\n        }\n        // save report after every job so progress is never lost\n        if (resultStore.length && WEDGE_SERVER && serverFolder) {\n            exportReport(true); // silent=true: no log spam per job\n        }\n    }\n    setBar(\'batch\',100); setBar(\'job\',100);\n    document.getElementById(\'progressText\').textContent = `Done — ${okCount}/${order.length} OK`;\n    log(\'Batch complete.\', \'header-line\');\n    const _dot=document.getElementById(\'terminal-dot\');\n    if(_dot){ _dot.classList.remove(\'blink\'); _dot.style.background=\'var(--ok)\'; _dot.classList.add(\'active\'); }\n    running = false;\n    updateRunButton();\n    document.getElementById(\'stopBtn\').disabled = true;\n    // auto-export report if we have results\n    if (resultStore.length) {\n        setTimeout(() => {\n            log(\'Auto-saving report...\', \'muted\');\n            exportReport();\n        }, 800);\n    }\n}\nfunction stopRun(){\n    stopFlag = true;\n    if (nukeAbort) { nukeAbort.aborted = true; nukeAbort = null; }\n    log(\'Stop requested — probing ComfyUI (soft stop or hard kill)...\', \'warn\');\n    document.getElementById(\'stopBtn\').disabled = true;\n    nukeJob(null).then(() => log(\'Queue cleared.\', \'muted\'));\n}\n\nlet sessionResults = {};\nasync function runChain(u, timeoutS){\n    const mode = u.mode || \'success\';\n    let last = {ok:false,status:\'error\',secs:0,outs:[],used:u.names[0]};\n    let lastGood = null;\n    for (let idx=0; idx<u.names.length; idx++){\n        if (stopFlag) break;\n        const nm = u.names[idx];\n        const res = await runLink(nm, u.names[0], timeoutS);\n        last = res;\n        if (mode===\'success\'){\n            if (res.ok) return res;\n            if (idx < u.names.length-1) log(`    ↳ fallback: ${nm} → ${u.names[idx+1]}`, \'fallback\');\n        } else {\n            if (res.ok){ lastGood = res; if (idx<u.names.length-1) log(`    ↳ next: ${nm} → ${u.names[idx+1]}`, \'fallback\'); }\n            else { return lastGood || res; }\n        }\n    }\n    return (mode===\'failure\' && lastGood) ? lastGood : last;\n}\n\n// runChainAll: like runChain but returns ALL intermediate results (one per workflow that ran)\nasync function runChainAll(u, timeoutS){\n    const mode = u.mode || \'success\';\n    const allResults = [];\n    let lastGood = null;\n    for (let idx = 0; idx < u.names.length; idx++){\n        if (stopFlag) break;\n        const nm = u.names[idx];\n        const res = await runLink(nm, u.names[0], timeoutS);\n        allResults.push(res);\n        // clear VRAM after this node if the per-node checkbox is on\n        if (u.nodeVram && u.nodeVram[nm]) await freeVram();\n        if (mode === \'success\'){\n            if (res.ok) break; // stop on first success\n            if (idx < u.names.length - 1) log(\'    ↳ fallback: \' + nm + \' → \' + u.names[idx+1], \'fallback\');\n        } else { // stop on failure\n            if (res.ok){\n                lastGood = res;\n                if (idx < u.names.length - 1) log(\'    ↳ next: \' + nm + \' → \' + u.names[idx+1], \'fallback\');\n            } else {\n                break;\n            }\n        }\n    }\n    return allResults;\n}\n\nasync function runLink(name, head, timeoutS){\n    if (name in sessionResults){\n        const r = sessionResults[name];\n        colorNode(name, r.ok?\'ok\':\'fail\', true);\n        log(`    \'${name}\' already done this session (${r.status}) — reusing`, \'muted\');\n        return {...r, used:name};\n    }\n    colorNode(name, \'running\', false);\n    const r = await runOne(name, timeoutS);\n    sessionResults[name] = r;\n    colorNode(name, r.ok?\'ok\':\'fail\', false);\n    return {...r, used:name};\n}\n\n// waitForComfy: poll until ComfyUI responds (or give up after maxWait)\nasync function waitForComfy(maxWaitMs=120000, intervalMs=3000){\n    const deadline = performance.now() + maxWaitMs;\n    let warned = false;\n    // first check — if ComfyUI responds immediately, skip silently\n    try {\n        const r = await fetch(comfyBase()+\'/system_stats\',\n            {signal: AbortSignal.timeout(2500)});\n        if (r.ok) return true;\n    } catch(e){}\n    // not immediately responsive — log and poll\n    log(\'    Waiting for ComfyUI to become responsive...\', \'muted\');\n    while (performance.now() < deadline){\n        try {\n            const r = await fetch(comfyBase()+\'/system_stats\',\n                {signal: AbortSignal.timeout(2500)});\n            if (r.ok){\n                log(\'    ComfyUI responsive.\', \'muted\');\n                return true;\n            }\n        } catch(e){}\n        await new Promise(r => setTimeout(r, intervalMs));\n    }\n    log(\'    ComfyUI did not respond after \' + (maxWaitMs/1000) + \'s — proceeding anyway\', \'warn\');\n    return false;\n}\n\nasync function runOne(name, timeoutS){\n    const src = workflows[name]?.wf;\n    if (!src){ log(`  ${name}: no workflow content loaded`, \'err\'); return {ok:false,status:\'missing\',secs:0,outs:[]}; }\n    const wf = JSON.parse(JSON.stringify(src));\n    rewritePrefix(wf, name);\n    // abort any in-progress nuke retry loops before starting new job\n    if (nukeAbort) { nukeAbort.aborted = true; nukeAbort = null; }\n    // wait for ComfyUI to be responsive before queuing\n    await waitForComfy();\n    log(`  running \'${name}\' …`, \'running\');\n    setBar(\'job\',0); document.getElementById(\'jobPct\').textContent=\'\';\n    const t0 = performance.now();\n    let pid;\n    try {\n        const resp = await fetch(comfyBase()+\'/prompt\', {\n            method:\'POST\', headers:{\'Content-Type\':\'application/json\'},\n            body: JSON.stringify({prompt:wf, client_id:clientId})\n        });\n        if (!resp.ok){ const b = await resp.text(); log(`    REJECTED (${resp.status}): ${b.slice(0,200)}`, \'err\'); return {ok:false,status:\'rejected\',secs:(performance.now()-t0)/1000,outs:[]}; }\n        const data = await resp.json();\n        pid = data.prompt_id;\n        if (!pid){ log(\'    no prompt_id returned\', \'err\'); return {ok:false,status:\'no_id\',secs:(performance.now()-t0)/1000,outs:[]}; }\n    } catch(e){ log(`    error queuing: ${e.message}`, \'err\'); return {ok:false,status:\'queue_error\',secs:(performance.now()-t0)/1000,outs:[]}; }\n\n    const entry = await awaitWithProgress(pid, t0, timeoutS);\n    const secs = (performance.now()-t0)/1000;\n    if (!entry) return {ok:false, status: (stopFlag?\'interrupted\':\'timeout\'), secs, outs:[]};\n\n    const status = entry.status || {};\n    const ok = status.status_str === \'success\' || status.completed === true;\n    const outs = [];\n    for (const node of Object.values(entry.outputs||{})){\n        for (const kind of [\'videos\',\'gifs\',\'images\',\'audio\']){\n            for (const item of (node[kind]||[])){\n                if (item.filename) outs.push({sub:item.subfolder||\'\', fn:item.filename, type:item.type||\'output\'});\n            }\n        }\n    }\n    if (!ok){\n        // log ComfyUI error details so user knows what went wrong\n        const msgs = status.messages || [];\n        msgs.forEach(m => {\n            if (Array.isArray(m) && m[0] === \'execution_error\'){\n                const d = m[1] || {};\n                log(\'    ComfyUI error: \' + (d.exception_message || d.node_type || JSON.stringify(d).slice(0,120)), \'err\');\n            }\n        });\n        if (!msgs.length && status.status_str){\n            log(\'    ComfyUI status: \' + status.status_str, \'err\');\n        }\n    }\n    log(\'    \' + (ok?\'OK\':\'finished (check)\') + \' in \' + secs.toFixed(1) + \'s\', ok?\'ok\':\'warn\');\n    return {ok, status: ok?\'ok\':\'check\', secs, outs};\n}\n\n// nukeJob: aggressively clear a stuck ComfyUI job\n// Phase 1 (immediate): interrupt + delete from queue + clear pending — retries up to 5x\n// Phase 2 (after 30s):  if job still running, force-unload all models from VRAM\n//                       NOTE: unloading models means next job reloads them from disk\nasync function fetchWithRetry(url, opts, retries=5, delayMs=3000, abortRef=null){\n    for (let i = 0; i < retries; i++){\n        // stop retrying if abort was requested\n        if (abortRef && abortRef.aborted) {\n            log(\'    retry aborted (new job starting)\', \'muted\');\n            return null;\n        }\n        try {\n            const r = await fetch(url, opts);\n            return r;\n        } catch(e){\n            if (abortRef && abortRef.aborted) return null;\n            if (i < retries - 1){\n                log(\'    retrying in \' + (delayMs/1000) + \'s... (attempt \' + (i+2) + \'/\' + retries + \')\', \'muted\');\n                await new Promise(r => setTimeout(r, delayMs));\n            } else {\n                throw e;\n            }\n        }\n    }\n}\n\n// shared abort controller for nukeJob — aborted when a new job starts\nlet nukeAbort = null;\n\nasync function nukeJob(pid){\n    const b = comfyBase();\n    const h = {\'Content-Type\':\'application/json\'};\n    nukeAbort = {aborted: false};\n    const myAbort = nukeAbort;\n\n    // ── Step 1: interrupt + clear queue ──────────────────────────────\n    log(\'    Sending interrupt + clearing queue...\', \'muted\');\n    let comfyResponsive = false;\n    try {\n        const ctrl = new AbortController();\n        setTimeout(() => ctrl.abort(), 2000);\n        await fetch(b+\'/interrupt\', {method:\'POST\', signal: ctrl.signal});\n        comfyResponsive = true;\n        if (pid) await fetch(b+\'/queue\', {method:\'POST\', headers:h,\n            body: JSON.stringify({delete:[pid]})});\n        await fetch(b+\'/queue\', {method:\'POST\', headers:h,\n            body: JSON.stringify({clear:true})});\n        log(\'    Interrupt sent, queue cleared.\', \'muted\');\n    } catch(e){\n        comfyResponsive = false;\n        log(\'    ComfyUI not responding to HTTP — going straight to hard kill.\', \'warn\');\n    }\n\n    // ── Step 2: verify nothing is still running (10s polling) ─────────\n    // A CUDA-frozen job can still accept HTTP but never actually stops.\n    // We must confirm queue_running is empty before calling it clean.\n    if (comfyResponsive) {\n        log(\'    Verifying queue is actually clear...\', \'muted\');\n        let confirmed = false;\n        const deadline = performance.now() + 10000;\n        while (performance.now() < deadline) {\n            await new Promise(r => setTimeout(r, 1500));\n            try {\n                const qr = await fetch(b+\'/queue\', {signal: AbortSignal.timeout(2000)});\n                const qd = await qr.json();\n                const running = (qd.queue_running || []).length;\n                if (running === 0) { confirmed = true; break; }\n                log(\'    Still \' + running + \' job(s) running — waiting...\', \'muted\');\n            } catch(e) { break; }\n        }\n        if (confirmed) {\n            log(\'    Queue confirmed empty. ComfyUI ready.\', \'ok\');\n            return;\n        }\n        // queue_running still has jobs — CUDA is stuck despite HTTP working\n        log(\'    Queue not clearing after 10s — CUDA stuck. Escalating to hard kill.\', \'warn\');\n    }\n\n    // ── Step 3: hard kill ─────────────────────────────────────────────\n    log(\'    Hard kill — restarting ComfyUI process...\', \'err\');\n\n    if (!WEDGE_SERVER){\n        log(\'    Auto-restart requires running via wedge_studio.py.\', \'warn\');\n        log(\'    Restart ComfyUI manually — waiting up to 3 min for it to come back...\', \'warn\');\n        await waitForComfy(180000, 4000);\n        return;\n    }\n    const comfyPath = document.getElementById(\'comfyPath\')?.value?.trim() || \'\';\n    if (!comfyPath){\n        log(\'    No ComfyUI folder set — set it in the header and click ✓.\', \'warn\');\n        log(\'    Restart ComfyUI manually — waiting up to 3 min for it to come back...\', \'warn\');\n        await waitForComfy(180000, 4000);\n        return;\n    }\n    try {\n        const rr = await fetch(WEDGE_SERVER+\'/restart_comfy\', {\n            method:\'POST\', headers:h,\n            body: JSON.stringify({comfy_path: comfyPath})\n        });\n        const rd = await rr.json();\n        if (rd.ok){\n            log(\'    Process killed. Waiting for ComfyUI to restart...\', \'warn\');\n            const recovered = await waitForComfy(90000, 3000);\n            if (recovered){ log(\'    ComfyUI back online.\', \'ok\'); }\n            else { log(\'    ComfyUI did not respond after 90s — check manually.\', \'err\'); }\n        } else {\n            log(\'    Kill failed: \' + rd.error, \'err\');\n        }\n    } catch(e){ log(\'    Restart request failed: \' + e.message, \'err\'); }\n}\n\n\nfunction awaitWithProgress(pid, t0, timeoutS){\n    return new Promise(async (resolve) => {\n        const deadline = t0 + timeoutS*1000;\n        let ws = null, done = false;\n        try {\n            ws = new WebSocket(\'ws://\'+server()+\'/ws?clientId=\'+clientId);\n            ws.onmessage = ev => {\n                try {\n                    const d = JSON.parse(ev.data);\n                    if (d.type===\'progress\' && d.data){\n                        const {value=0, max=1} = d.data;\n                        setBar(\'job\', value/Math.max(1,max)*100);\n                        document.getElementById(\'jobPct\').textContent = `${value}/${max}`;\n                    }\n                } catch(e){}\n            };\n            ws.onerror = () => {};\n        } catch(e){ ws = null; }\n\n        const finish = (val) => { if (done) return; done = true; if (ws){ try{ws.close();}catch(e){}} resolve(val); };\n\n        while (!done){\n            if (stopFlag){\n                await nukeJob(pid);\n                return finish(null);\n            }\n            if (performance.now() > deadline){\n                log(\'    TIMEOUT after \' + (timeoutS/60).toFixed(0) + \' min.\', \'err\');\n                log(\'    Probing ComfyUI — soft stop if responsive, hard kill if frozen...\', \'warn\');\n                await nukeJob(pid);\n                return finish(null);\n            }\n            try {\n                const r = await fetch(comfyBase()+`/history/${pid}`);\n                if (r.ok){ const h = await r.json(); if (h[pid]) return finish(h[pid]); }\n            } catch(e){}\n            await sleep(1500);\n        }\n    });\n}\n\nfunction setBar(which, pct){ document.getElementById(which+\'Fill\').style.width = pct + \'%\'; }\n\n// ============ results ============\nfunction viewUrl(out){\n    const p = new URLSearchParams({filename: out.fn, subfolder: out.sub, type: out.type});\n    return base() + \'/view?\' + p.toString();\n}\n// ── result store for lightbox navigation & report export ──\nconst resultStore = [];  // {name, used, status, secs, vidUrl, imgUrl}\n\n// addResult: called by the runner — creates one card per output file\nfunction addResult(name, res){\n    const used = res.used && res.used!==name ? `${name} \\u2192 ${res.used}` : name;\n    const mediaOuts = (res.outs||[]).filter(o =>\n        /\\.(mp4|webm|mov|gif|png|jpe?g|webp)$/i.test(o.fn));\n\n    if (mediaOuts.length > 0){\n        // one card per output file\n        mediaOuts.forEach((o, i) => {\n            const isVid = /\\.(mp4|webm|mov)$/i.test(o.fn);\n            const isImg = /\\.(png|jpe?g|webp|gif)$/i.test(o.fn);\n            const label = mediaOuts.length > 1 ? `${used} [${i+1}/${mediaOuts.length}]` : used;\n            addResultCard(\n                name, label, res.status, res.secs,\n                isVid ? viewUrl(o) : (res.vidUrl||null),\n                isImg ? viewUrl(o) : (res.imgUrl||null),\n                o  // raw out for report media\n            );\n        });\n    } else {\n        // no outs — fall back to pre-baked URLs (report mode) or show no-preview\n        addResultCard(name, used, res.status, res.secs, res.vidUrl||null, res.imgUrl||null);\n    }\n}\n\nfunction addResultCard(name, used, status, secs, vidUrl, imgUrl, rawOut){\n    const grid = document.getElementById(\'results\');\n    const idx = resultStore.length;\n    resultStore.push({name, used, status, secs, vidUrl, imgUrl, rawOut: rawOut||null});\n\n    const card = document.createElement(\'div\');\n    card.className = \'result-card\';\n    card.dataset.idx = String(idx);\n\n    // thumbnail\n    const thumb = document.createElement(\'div\');\n    thumb.className = \'result-thumb\';\n    if (vidUrl){\n        const vid2 = document.createElement(\'video\');\n        vid2.src = vidUrl + \'#t=0.1\';\n        vid2.preload = \'metadata\';\n        vid2.muted = true;\n        thumb.appendChild(vid2);\n        const play = document.createElement(\'div\');\n        play.className = \'play\';\n        play.textContent = \'\\u25b6\';\n        thumb.appendChild(play);\n    } else if (imgUrl){\n        const im = document.createElement(\'img\');\n        im.src = imgUrl;\n        thumb.appendChild(im);\n    } else {\n        const np = document.createElement(\'span\');\n        np.className = \'no-prev\';\n        np.textContent = \'no preview\';\n        thumb.appendChild(np);\n    }\n    thumb.addEventListener(\'click\', () => lbOpen(idx));\n    card.appendChild(thumb);\n\n    // compare checkbox\n    const cb = document.createElement(\'span\');\n    cb.className = \'compare-cb\';\n    cb.textContent = \'\\u2713\';\n    cb.addEventListener(\'click\', (e) => { e.stopPropagation(); toggleCompare(e, idx); });\n    card.appendChild(cb);\n\n    // meta\n    const sc = {ok:\'ok\',check:\'check\'}[status] || \'fail\';\n    const meta = document.createElement(\'div\');\n    meta.className = \'result-meta\';\n    meta.innerHTML =\n        \'<div class="result-name">\' + escapeHtml(used) + \'</div>\' +\n        \'<div class="result-status \' + sc + \'">\' + status + \' \\u00b7 \' + secs.toFixed(0) + \'s</div>\';\n    card.appendChild(meta);\n\n    grid.appendChild(card);\n    const expBtn = document.getElementById(\'exportReportBtn\');\n    if (expBtn) expBtn.disabled = false;\n    const cBar = document.getElementById(\'compareBar\');\n    if (cBar) cBar.classList.add(\'visible\');\n}\n\n// ── compare selection ──────────────────────────────────────────────────\nconst compareSet = new Set();\nfunction toggleCompare(e, idx){\n    e.stopPropagation();\n    if (compareSet.has(idx)){\n        compareSet.delete(idx);\n    } else {\n        if (compareSet.size >= 2){\n            // deselect oldest\n            const first = compareSet.values().next().value;\n            compareSet.delete(first);\n            document.querySelector(`.result-card[data-idx="${first}"]`)?.classList.remove(\'in-compare\');\n        }\n        compareSet.add(idx);\n    }\n    document.querySelectorAll(\'.result-card\').forEach(c => {\n        c.classList.toggle(\'in-compare\', compareSet.has(Number(c.dataset.idx)));\n    });\n    const n = compareSet.size;\n    const countEl = document.getElementById(\'compareCount\');\n    const btnEl   = document.getElementById(\'compareBtn\');\n    if (countEl) countEl.textContent = n === 0 ? \'0 selected\' : n === 1 ? \'1 selected (pick one more)\' : \'2 selected\';\n    if (btnEl)   btnEl.disabled = n !== 2;\n}\nfunction clearCompare(){\n    compareSet.clear();\n    document.querySelectorAll(\'.result-card\').forEach(c => c.classList.remove(\'in-compare\'));\n    const countEl = document.getElementById(\'compareCount\');\n    const btnEl   = document.getElementById(\'compareBtn\');\n    if (countEl) countEl.textContent = \'0 selected\';\n    if (btnEl)   btnEl.disabled = true;\n}\n\n// ── standard lightbox ──────────────────────────────────────────────────\nlet lbIdx = -1;\nfunction lbOpen(idx){\n    lbIdx = idx; lbRender();\n    const lb = document.getElementById(\'lightbox\');\n    if (lb) lb.classList.add(\'open\');\n}\nfunction lbClose(){\n    document.getElementById(\'lightbox\').classList.remove(\'open\');\n    // pause any playing video\n    document.getElementById(\'lbContent\').querySelectorAll(\'video\').forEach(v => v.pause());\n}\nfunction lbNav(dir){\n    if (!resultStore.length) return;\n    lbIdx = (lbIdx + dir + resultStore.length) % resultStore.length;\n    lbRender();\n}\nfunction lbRender(){\n    const r = resultStore[lbIdx];\n    if (!r) return;\n    const el = document.getElementById(\'lbContent\');\n    if (r.vidUrl){\n        el.innerHTML = `<video src="${r.vidUrl}" controls autoplay muted style="max-width:100%;max-height:calc(100vh - 120px);border-radius:3px;"></video>`;\n    } else if (r.imgUrl){\n        el.innerHTML = `<img src="${r.imgUrl}" style="max-width:100%;max-height:calc(100vh - 120px);border-radius:3px;">`;\n    } else {\n        el.innerHTML = `<div style="color:var(--text-dim);font-size:11px;letter-spacing:.1em;">No media</div>`;\n    }\n    document.getElementById(\'lbMeta\').textContent = `${r.used}  ·  ${r.status}  ·  ${r.secs.toFixed(0)}s`;\n    document.getElementById(\'lbCounter\').textContent = `${lbIdx+1} / ${resultStore.length}`;\n}\n\n// ── keyboard navigation ────────────────────────────────────────────────\ndocument.addEventListener(\'keydown\', e => {\n    if (document.getElementById(\'lightbox\').classList.contains(\'open\')){\n        if (e.key === \'ArrowLeft\')  lbNav(-1);\n        if (e.key === \'ArrowRight\') lbNav(1);\n        if (e.key === \'Escape\')     lbClose();\n    }\n    if (document.getElementById(\'wipeLb\').classList.contains(\'open\')){\n        if (e.key === \'Escape\') wipeClose();\n    }\n});\n\n// ── wipe compare ──────────────────────────────────────────────────────\nfunction openWipe(){\n    const idxs = [...compareSet];\n    if (idxs.length !== 2) return;\n    const [a, b] = idxs.map(i => resultStore[i]);\n    const aEl = document.getElementById(\'wipeA\');\n    const bEl = document.getElementById(\'wipeB\');\n    const mkMedia = (r) => r.vidUrl\n        ? `<video src="${r.vidUrl}" loop muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>`\n        : r.imgUrl\n        ? `<img src="${r.imgUrl}" style="width:100%;height:100%;object-fit:contain;">`\n        : `<div style="color:var(--text-dim);font-size:11px;padding:20px;">No media</div>`;\n    aEl.innerHTML = mkMedia(a);\n    bEl.innerHTML = mkMedia(b);\n    document.getElementById(\'wipeLblA\').textContent = a.used;\n    document.getElementById(\'wipeLblB\').textContent = b.used;\n    // set initial wipe at 50%\n    wipeSetPos(50);\n    document.getElementById(\'wipeLb\').classList.add(\'open\');\n    // size the wrap to the natural video size\n    const wrapEl = document.getElementById(\'wipeWrap\');\n    wrapEl.style.width  = \'calc(100vw - 80px)\';\n    wrapEl.style.height = \'calc(100vh - 160px)\';\n    const playBtn = document.getElementById(\'wipePlayBtn\');\n    if (playBtn) playBtn.textContent = \'⏸ Pause\';\n    setTimeout(() => {\n        const vids = document.querySelectorAll(\'#wipeA video, #wipeB video\');\n        vids.forEach(v => { v.play().catch(()=>{}); });\n        wipeBindSync();\n        scrubInit();\n        wipeUpdatePlayBtn();\n    }, 100);\n}\nfunction wipeClose(){\n    document.getElementById(\'wipeLb\').classList.remove(\'open\');\n    document.querySelectorAll(\'#wipeA video, #wipeB video\').forEach(v => {\n        v.pause(); v.playbackRate = 1;\n    });\n    // reset speed buttons + scrubber state\n    document.querySelectorAll(\'.speed-btn\').forEach(b => b.classList.remove(\'active\'));\n    const b1 = document.getElementById(\'speedBtn1\');\n    if (b1) b1.classList.add(\'active\');\n    scrubDragging = false;\n    scrubTeardown();\n}\nfunction wipeSetPos(pct){\n    document.getElementById(\'wipeA\').style.clipPath = `inset(0 ${100-pct}% 0 0)`;\n    document.getElementById(\'wipeHandle\').style.left = pct + \'%\';\n    // force repaint of paused video frames via requestVideoFrameCallback if available\n    // deliberately NOT nudging currentTime (causes scrubber feedback loop)\n    if (!scrubDragging){\n        document.querySelectorAll(\'#wipeA video, #wipeB video\').forEach(v => {\n            if (v.paused && v.readyState >= 2){\n                if (v.requestVideoFrameCallback){\n                    v.requestVideoFrameCallback(() => {}); // nudge decoder\n                } else {\n                    // minimal canvas trick: draw one frame to force repaint\n                    try {\n                        const c = document.createElement(\'canvas\');\n                        c.width = 2; c.height = 2;\n                        c.getContext(\'2d\').drawImage(v, 0, 0, 2, 2);\n                    } catch(e){}\n                }\n            }\n        });\n    }\n}\n// drag the handle\n(function(){\n    let dragging = false;\n    document.addEventListener(\'mousedown\', e => { if (e.target.id === \'wipeHandle\') dragging = true; });\n    document.addEventListener(\'mouseup\',   () => dragging = false);\n    document.addEventListener(\'mousemove\', e => {\n        if (!dragging) return;\n        const wrap = document.getElementById(\'wipeWrap\');\n        if (!wrap) return;\n        const rect = wrap.getBoundingClientRect();\n        const pct = Math.max(2, Math.min(98, (e.clientX - rect.left) / rect.width * 100));\n        wipeSetPos(pct);\n    });\n    // touch\n    document.addEventListener(\'touchstart\', e => { if (e.target.id === \'wipeHandle\') dragging = true; }, {passive:true});\n    document.addEventListener(\'touchend\',   () => dragging = false);\n    document.addEventListener(\'touchmove\',  e => {\n        if (!dragging) return;\n        const wrap = document.getElementById(\'wipeWrap\');\n        if (!wrap) return;\n        const rect = wrap.getBoundingClientRect();\n        const pct = Math.max(2, Math.min(98, (e.touches[0].clientX - rect.left) / rect.width * 100));\n        wipeSetPos(pct);\n    }, {passive:true});\n})();\n\nfunction wipeBindSync(){\n    const va = document.querySelector(\'#wipeA video\');\n    const vb = document.querySelector(\'#wipeB video\');\n    if (!va || !vb) return;\n    let syncing = false;\n    const sync = (leader, follower) => {\n        if (syncing) return;\n        syncing = true;\n        if (Math.abs(follower.currentTime - leader.currentTime) > 0.05)\n            follower.currentTime = leader.currentTime;\n        if (!leader.paused && follower.paused) follower.play().catch(()=>{});\n        if (leader.paused && !follower.paused) follower.pause();\n        syncing = false;\n    };\n    va.addEventListener(\'timeupdate\', () => sync(va, vb));\n    va.addEventListener(\'play\',  () => { vb.play().catch(()=>{}); wipeUpdatePlayBtn(); });\n    va.addEventListener(\'pause\', () => { vb.pause(); wipeUpdatePlayBtn(); });\n    va.addEventListener(\'seeked\', () => { if (Math.abs(vb.currentTime - va.currentTime) > 0.05) vb.currentTime = va.currentTime; });\n    vb.addEventListener(\'play\',  () => { va.play().catch(()=>{}); wipeUpdatePlayBtn(); });\n    vb.addEventListener(\'pause\', () => { va.pause(); wipeUpdatePlayBtn(); });\n    vb.addEventListener(\'seeked\', () => { if (Math.abs(va.currentTime - vb.currentTime) > 0.05) va.currentTime = vb.currentTime; });\n}\n\n\nfunction wipeTogglePlay(){\n    const vids = [...document.querySelectorAll(\'#wipeA video, #wipeB video\')];\n    if (!vids.length) return;\n    const anyPlaying = vids.some(v => !v.paused);\n    if (anyPlaying){\n        vids.forEach(v => v.pause());\n    } else {\n        vids.forEach(v => v.play().catch(()=>{}));\n    }\n    // button label updated via the play/pause event listeners in wipeBindSync\n}\nfunction wipeUpdatePlayBtn(){\n    const vids = [...document.querySelectorAll(\'#wipeA video, #wipeB video\')];\n    const anyPlaying = vids.some(v => !v.paused);\n    const btn = document.getElementById(\'wipePlayBtn\');\n    if (btn) btn.textContent = anyPlaying ? \'⏸ Pause\' : \'▶ Play\';\n}\nfunction setWipeSpeed(rate){\n    document.querySelectorAll(\'#wipeA video, #wipeB video\').forEach(v => { v.playbackRate = rate; });\n    document.querySelectorAll(\'.speed-btn\').forEach(b => {\n        const btnRate = parseFloat(b.textContent.replace(\'×\',\'\'));\n        b.classList.toggle(\'active\', Math.abs(btnRate - rate) < 0.001);\n    });\n}\n\n// ── frame scrubber ────────────────────────────────────────────────────\nlet scrubDragging = false;\nlet _scrubTeardownFns = [];\nfunction scrubTeardown(){\n    scrubDragging = false;\n    _scrubTeardownFns.forEach(fn => fn());\n    _scrubTeardownFns = [];\n}\n\nfunction scrubUpdate(pct){\n    const va = document.querySelector(\'#wipeA video\');\n    const vb = document.querySelector(\'#wipeB video\');\n    const vid = va || vb;\n    if (!vid || !vid.duration) return;\n    const time = pct / 100 * vid.duration;\n    if (va){ va.currentTime = time; }\n    if (vb){ vb.currentTime = time; }\n    scrubSetPosition(pct, time, vid.duration);\n}\n\nfunction scrubSetPosition(pct, time, duration){\n    const needle = document.getElementById(\'scrubNeedle\');\n    const fill   = document.getElementById(\'scrubFill\');\n    const label  = document.getElementById(\'scrubLabel\');\n    if (!needle) return;\n    needle.style.left = pct + \'%\';\n    if (fill) fill.style.width = pct + \'%\';\n    if (label && duration){\n        // calculate frame number assuming 30fps (best guess without metadata)\n        const fps = wipeDetectedFps || 30;\n        const frame = Math.round(time * fps);\n        const totalFrames = Math.round(duration * fps);\n        label.textContent = \'frame \' + frame + \' / \' + totalFrames;\n    }\n}\n\nfunction scrubFromVideo(){\n    const va = document.querySelector(\'#wipeA video\');\n    const vid = va || document.querySelector(\'#wipeB video\');\n    if (!vid || !vid.duration) return;\n    const pct = vid.currentTime / vid.duration * 100;\n    scrubSetPosition(pct, vid.currentTime, vid.duration);\n}\n\nlet wipeDetectedFps = 30;\nfunction scrubInit(){\n    scrubTeardown(); // remove any previous listeners before re-attaching\n    const fpsEl = document.getElementById(\'scrubFps\');\n    if (fpsEl) wipeDetectedFps = parseInt(fpsEl.value) || 30;\n    setWipeSpeed(1);\n    const track = document.getElementById(\'scrubTrack\');\n    if (!track) return;\n    const va = document.querySelector(\'#wipeA video\');\n    if (va){\n        const _onTU = scrubFromVideo;\n        const _onMeta = () => {\n            const s = document.getElementById(\'wipeScrubber\');\n            if (s) s.style.opacity = \'1\';\n            scrubFromVideo();\n        };\n        va.addEventListener(\'timeupdate\', _onTU);\n        va.addEventListener(\'loadedmetadata\', _onMeta);\n        _scrubTeardownFns.push(() => {\n            va.removeEventListener(\'timeupdate\', _onTU);\n            va.removeEventListener(\'loadedmetadata\', _onMeta);\n        });\n    }\n\n    const getScrubPct = (e) => {\n        const rect = track.getBoundingClientRect();\n        const x = (e.touches ? e.touches[0].clientX : e.clientX);\n        return Math.max(0, Math.min(100, (x - rect.left) / rect.width * 100));\n    };\n\n    const _onDown  = e => { scrubDragging = true; document.querySelectorAll(\'#wipeA video, #wipeB video\').forEach(v => v.pause()); scrubUpdate(getScrubPct(e)); };\n    const _onMove  = e => { if (scrubDragging) scrubUpdate(getScrubPct(e)); };\n    const _onUp    = ()  => { scrubDragging = false; };\n    const _onTDown = e => { scrubDragging = true; scrubUpdate(getScrubPct(e)); };\n    const _onTMove = e => { if (scrubDragging) scrubUpdate(getScrubPct(e)); };\n    const _onTEnd  = ()  => { scrubDragging = false; };\n\n    track.addEventListener(\'mousedown\', _onDown);\n    document.addEventListener(\'mousemove\', _onMove);\n    document.addEventListener(\'mouseup\', _onUp);\n    track.addEventListener(\'touchstart\', _onTDown, {passive:true});\n    document.addEventListener(\'touchmove\', _onTMove, {passive:true});\n    document.addEventListener(\'touchend\', _onTEnd);\n\n    _scrubTeardownFns.push(() => {\n        track.removeEventListener(\'mousedown\', _onDown);\n        document.removeEventListener(\'mousemove\', _onMove);\n        document.removeEventListener(\'mouseup\', _onUp);\n        track.removeEventListener(\'touchstart\', _onTDown);\n        document.removeEventListener(\'touchmove\', _onTMove);\n        document.removeEventListener(\'touchend\', _onTEnd);\n    });\n}\n\n// ── export standalone report ──────────────────────────────────────────────\nfunction exportReport(silent=false){\n    if (!resultStore.length){\n        if (!silent) alert(\'No results yet \\u2014 run a batch first.\');\n        return;\n    }\n    if (!WEDGE_SERVER || !serverFolder){\n        log(\'No server \\u2014 report requires wedge_studio to be running.\', \'warn\');\n        return;\n    }\n    const stamp = new Date().toISOString();\n    const logLines = [...(document.getElementById(\'terminal-body\').querySelectorAll(\'.tlog-line\'))]\n        .map(d => d.innerText || d.textContent).join(\'\\n\');\n    const savePath = serverFolder.replace(/\\\\/g, \'/\').replace(/\\/$/, \'\')\n        + \'/wedge_report_\' + stamp.replace(/[:.]/g, \'-\').slice(0,19) + \'.html\';\n    const payload = {\n        path: savePath, stamp,\n        server:  document.getElementById(\'server\').value.trim() || \'127.0.0.1:8188\',\n        order:   JSON.parse(JSON.stringify(order)),\n        results: resultStore.map(r => ({\n            name: r.name, used: r.used, status: r.status, secs: r.secs,\n            rawOut: r.rawOut || null,\n        })),\n        logLines,\n    };\n    fetch(WEDGE_SERVER + \'/generate_report\', {\n        method: \'POST\', headers: {\'Content-Type\':\'application/json\'},\n        body: JSON.stringify(payload),\n    }).then(r => r.json()).then(d => {\n        if (d.ok){\n            if (!silent) log(\'Report saved: \' + d.path, \'ok\');\n            else log(\'\\u2713 report \\u2014 \' + (d.path||\'\').split(/[\\\\\\/]/).pop(), \'muted\');\n        } else {\n            log(\'Report error: \' + (d.error||\'?\'), \'warn\');\n        }\n    }).catch(e => log(\'Report failed: \' + e.message, \'warn\'));\n}\n\n\nfunction browserDownload(reportHtml, filename){\n    // Try 1: Blob URL\n    try {\n        const blob = new Blob([reportHtml], {type:\'text/html;charset=utf-8\'});\n        const url = URL.createObjectURL(blob);\n        const a = document.createElement(\'a\');\n        a.href = url; a.download = filename;\n        document.body.appendChild(a); a.click();\n        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);\n        if (!silent) log(\'Report downloaded: \' + filename, \'ok\');\n        return;\n    } catch(e1) { console.warn(\'Blob download failed:\', e1); }\n    // Try 2: data URI\n    try {\n        const a = document.createElement(\'a\');\n        a.href = \'data:text/html;charset=utf-8,\' + encodeURIComponent(reportHtml);\n        a.download = filename;\n        document.body.appendChild(a); a.click();\n        setTimeout(() => a.remove(), 1000);\n        log(\'Report downloaded (data URI): \' + filename, \'ok\');\n        return;\n    } catch(e2) { console.warn(\'Data URI failed:\', e2); }\n    // Try 3: new window\n    try {\n        const win = window.open(\'\', \'_blank\');\n        if (win){ win.document.open(); win.document.write(reportHtml); win.document.close();\n            log(\'Report opened in new tab -- Ctrl+S to save\', \'warn\'); return; }\n    } catch(e3) { console.warn(\'New window failed:\', e3); }\n    log(\'Download blocked -- check browser settings\', \'err\');\n}\n\nfunction playVideo(el, url){\n    el.innerHTML = `<video src="${url}" controls autoplay muted style="width:100%;height:100%;object-fit:contain;background:#000"></video>`;\n}\n\n// ============ load baked plan if present ============\nfunction loadBakedPlan(){\n    // report mode: restore results from baked data\n        // load baked plan (download mode)\n    if (!BAKED_PLAN) return;\n    try {\n        order = BAKED_PLAN.order || [];\n        if (BAKED_PLAN.server) document.getElementById(\'server\').value = BAKED_PLAN.server;\n        if (BAKED_PLAN.timeout) document.getElementById(\'timeout\').value = BAKED_PLAN.timeout;\n        for (const [name, wf] of Object.entries(BAKED_PLAN.workflows || {})){\n            workflows[name] = {wf, validApi: true};\n        }\n        log(`Loaded baked plan: ${order.length} unit(s), ${Object.keys(BAKED_PLAN.workflows||{}).length} workflow(s).`, \'header-line\');\n        renderAvail(); renderOrder(); renderGraph();\n    } catch(e){ log(\'Could not parse baked plan: \' + e.message, \'err\'); }\n}\n\n// init\n// load saved config (comfy path etc) from server\nif (WEDGE_SERVER) {\n    // show the comfyPath config field immediately\n    const cpCfg = document.getElementById(\'comfyPathCfg\');\n    if (cpCfg) cpCfg.style.display = \'flex\';\n    // load saved config\n    fetch(WEDGE_SERVER+\'/get_config\').then(r=>r.json()).then(d=>{\n        if (d.ok){\n            if (d.comfy_path){\n                const el = document.getElementById(\'comfyPath\');\n                if (el) el.value = d.comfy_path;\n            }\n            if (d.timeout !== undefined){\n                const tEl = document.getElementById(\'timeout\');\n                if (tEl) tEl.value = d.timeout;\n            }\n            if (d.order && d.order.length){\n                _pendingSavedOrder = d.order;\n                applyPendingSavedOrder(); // applies immediately if workflows already loaded\n            }\n            if (d.comfy_path)\n                log(\'Config loaded — ComfyUI: \' + d.comfy_path, \'muted\');\n            else\n                log(\'ComfyUI folder not set — enter path in header and click ✓ to enable auto-restart.\', \'warn\');\n        } else {\n            log(\'ComfyUI folder not set — enter path in header and click ✓ to enable auto-restart.\', \'warn\');\n        }\n    }).catch(e => {\n        log(\'Could not load config: \' + e.message, \'warn\');\n    });\n}\n\n// ── folder browser ───────────────────────────────────────────────────\nlet fbCurrentPath = \'\';\n\nasync function openFolderBrowser(){\n    if (!WEDGE_SERVER){ alert(\'Folder browser requires running via wedge_studio.py\'); return; }\n    const startPath = document.getElementById(\'folderPathInput\').value.trim() || \'.\';\n    document.getElementById(\'folderBrowser\').classList.add(\'open\');\n    await fbNavigate(startPath);\n}\nfunction closeFolderBrowser(){\n    document.getElementById(\'folderBrowser\').classList.remove(\'open\');\n}\nasync function fbNavigate(path){\n    try {\n        const r = await fetch(WEDGE_SERVER + \'/browse?folder=\' + encodeURIComponent(path));\n        const d = await r.json();\n        if (!d.ok){ log(\'Browse error: \' + d.error, \'err\'); return; }\n        fbCurrentPath = d.current;\n\n        // breadcrumb\n        const bc = document.getElementById(\'fbBreadcrumb\');\n        bc.innerHTML = \'\';\n        d.parents.forEach((p, i) => {\n            const span = document.createElement(\'span\');\n            span.className = \'fb-crumb\' + (i === d.parents.length - 1 ? \' current\' : \'\');\n            // show only the name part for readability, except the root\n            span.textContent = i === 0 ? p.name : p.name.split(/[/\\\\]/).pop() || p.name;\n            span.title = p.path;\n            if (i < d.parents.length - 1) span.addEventListener(\'click\', () => fbNavigate(p.path));\n            bc.appendChild(span);\n            if (i < d.parents.length - 1){\n                const sep = document.createElement(\'span\');\n                sep.className = \'fb-sep\'; sep.textContent = \'›\';\n                bc.appendChild(sep);\n            }\n        });\n\n        // list\n        const list = document.getElementById(\'fbList\');\n        list.innerHTML = \'\';\n        if (!d.subdirs.length){\n            const empty = document.createElement(\'div\');\n            empty.style.cssText = \'padding:16px 18px;font-size:10px;color:var(--text-dim);\';\n            empty.textContent = \'No subfolders here.\';\n            list.appendChild(empty);\n        }\n        d.subdirs.forEach(sub => {\n            const item = document.createElement(\'div\');\n            item.className = \'fb-item\';\n            item.innerHTML = \'<span class="fb-ico">&#128193;</span><span>\' + escapeHtml(sub.name) + \'</span>\';\n            item.addEventListener(\'click\', () => fbNavigate(sub.path));\n            list.appendChild(item);\n        });\n\n        // footer\n        document.getElementById(\'fbCurrentPath\').textContent = d.current;\n        const cnt = d.json_count;\n        document.getElementById(\'fbJsonCount\').textContent =\n            cnt === 0 ? \'no .json files\' : cnt + \' workflow\' + (cnt===1?\'\':\'s\') + \' found\';\n        document.getElementById(\'fbSelectBtn\').disabled = cnt === 0;\n    } catch(e){ log(\'Browse error: \' + e.message, \'err\'); }\n}\nfunction selectFolderFromBrowser(){\n    if (!fbCurrentPath) return;\n    document.getElementById(\'folderPathInput\').value = fbCurrentPath;\n    closeFolderBrowser();\n    loadFromServer();\n}\n\nfunction saveComfyPath(){\n    const path = document.getElementById(\'comfyPath\')?.value?.trim();\n    if (!path){ log(\'Enter a ComfyUI folder path first.\',\'warn\'); return; }\n    if (!WEDGE_SERVER){ log(\'Save requires running via wedge_studio.py\',\'warn\'); return; }\n    const tEl = document.getElementById(\'timeout\');\n    const payload = {\n        comfy_path: path,\n        timeout:    parseFloat(tEl?.value) || 20,\n        order:      JSON.parse(JSON.stringify(order))\n    };\n    fetch(WEDGE_SERVER+\'/save_config\', {method:\'POST\',\n        headers:{\'Content-Type\':\'application/json\'},\n        body: JSON.stringify(payload)\n    }).then(r=>r.json()).then(d=>{\n        if (d.ok){ log(\'\\u2713 Config saved: ComfyUI path, timeout (\' + (tEl?.value||20) + \' min), order (\' + order.length + \' unit(s)).\',\'ok\'); }\n        else { log(\'Save failed: \'+d.error,\'err\'); }\n    }).catch(e=>{ log(\'Could not save config: \'+e.message,\'warn\'); });\n}\n\nloadBakedPlan();\nrenderOrder();\ncheckComfy();\n// if running from wedge_studio.py server, show the path input\nif (WEDGE_SERVER) {\n    document.getElementById(\'serverFolderRow\').style.display = \'block\';\n    document.getElementById(\'dropzone\').style.display = \'none\';\n    // set default folder to server\'s working directory\n    fetch(WEDGE_SERVER + \'/list_workflows?folder=.\')\n        .then(r => r.json())\n        .then(d => {\n            if (d.ok) {\n                serverFolder = d.folder;\n                document.getElementById(\'folderPathInput\').value = d.folder;\n                autoLoadFromServer(d.folder, d.files);\n            }\n        }).catch(() => {});\n}\n\nasync function loadFromServer(){\n    const path = document.getElementById(\'folderPathInput\').value.trim();\n    if (!path) return;\n    try {\n        const r = await fetch(WEDGE_SERVER + \'/list_workflows?folder=\' + encodeURIComponent(path));\n        const d = await r.json();\n        if (!d.ok){ log(\'Cannot read folder: \' + d.error, \'err\'); return; }\n        serverFolder = d.folder;\n        document.getElementById(\'folderPathInput\').value = d.folder;\n        autoLoadFromServer(d.folder, d.files);\n    } catch(e){ log(\'Server error: \' + e.message, \'err\'); }\n}\n\n// Apply saved order from config once workflows are loaded\n// Called both from get_config (in case workflows already loaded) and from\n// autoLoadFromServer (after workflows are loaded).  Filters out any unit\n// names that weren\'t found on disk.\nfunction applyPendingSavedOrder(){\n    if (!_pendingSavedOrder || !Object.keys(workflows).length) return;\n    const saved = _pendingSavedOrder;\n    _pendingSavedOrder = null;\n    const loaded = new Set(Object.keys(workflows));\n    const filtered = [];\n    for (const u of saved){\n        if (u.type === \'single\'){\n            if (loaded.has(u.name)) filtered.push(u);\n        } else {\n            const names = u.names.filter(n => loaded.has(n));\n            if (names.length >= 2) filtered.push({...u, names});\n            else if (names.length === 1) filtered.push({type:\'single\', name:names[0]});\n        }\n    }\n    if (filtered.length){\n        order = filtered;\n        renderOrder(); renderGraph(); updateRunButton();\n        log(\'\\u2713 Run order restored from _wedge_config.json (\' + filtered.length + \' unit(s)).\', \'muted\');\n    }\n}\n\nasync function autoLoadFromServer(folder, files){\n    if (!files.length){ log(\'No .json files found in \' + folder, \'warn\'); return; }\n    // fetch all workflow contents in one POST\n    const r = await fetch(WEDGE_SERVER + \'/read_workflows\', {\n        method: \'POST\',\n        headers: {\'Content-Type\':\'application/json\'},\n        body: JSON.stringify({folder, files})\n    });\n    const d = await r.json();\n    workflows = {}; order = []; chainSel = []; selUnit = null;\n    let okN = 0, badN = 0;\n    for (const [fname, res] of Object.entries(d.workflows)){\n        const name = fname.replace(/\\.json$/i, \'\');\n        if (res.ok){\n            try {\n                const wf = JSON.parse(res.content);\n                if (isApiFormat(wf)){ workflows[name] = {wf, validApi:true}; order.push({type:\'single\',name}); okN++; }\n                else { workflows[name] = {wf:null, validApi:false}; badN++; }\n            } catch(e){ workflows[name] = {wf:null, validApi:false}; badN++; }\n        } else { badN++; }\n    }\n    folderName = folder.split(/[\\/\\\\]/).filter(Boolean).pop() || \'wedge\';\n    if (okN) log(\'Loaded \' + okN + \' workflow(s) from \' + folder, \'muted\');\n    if (badN) log(badN + \' file(s) skipped (not API format)\', \'warn\');\n    renderAvail(); renderOrder(); renderGraph(); updateRunButton();\n    applyPendingSavedOrder(); // restore saved order if config arrived before/after workflows\n}\n</script>\n\n<!-- ── bottom log terminal ── -->\n<div id="terminal" class="collapsed">\n    <div id="terminal-bar">\n        <div id="terminal-bar-left">\n            <span id="terminal-dot"></span>\n            <span id="terminal-label">Log</span>\n        </div>\n        <div id="terminal-actions">\n            <button class="btn btn-sm" onclick="event.stopPropagation();clearTerminal()">Clear</button>\n            <button class="btn btn-sm" onclick="event.stopPropagation();toggleTerminal()">✕</button>\n        </div>\n    </div>\n    <div id="terminal-body"></div>\n</div>\n\n</body>\n</html>\n'
# ── auto-detect ComfyUI installation path ────────────────────────────────────
def _detect_comfy_path():
    """Try to find ComfyUI root folder by inspecting running processes."""
    try:
        import psutil
        our_pid = os.getpid()
        for proc in psutil.process_iter(['pid','cmdline','cwd']):
            try:
                if proc.pid == our_pid: continue
                cmd = ' '.join(proc.info['cmdline'] or [])
                cwd = proc.info.get('cwd') or ''
                if 'main.py' in cmd and ('comfyui' in cmd.lower() or 'comfyui' in cwd.lower()):
                    if cwd and os.path.exists(os.path.join(cwd, 'main.py')):
                        return cwd
                    for part in (proc.info['cmdline'] or []):
                        if part.endswith('main.py'):
                            d = os.path.dirname(os.path.abspath(part))
                            if os.path.exists(os.path.join(d, 'main.py')):
                                return d
            except Exception: pass
    except ImportError: pass
    for p in [r'D:\ComfyUI', r'C:\ComfyUI',
              os.path.expanduser('~/ComfyUI'),
              os.path.expanduser('~/Desktop/ComfyUI')]:
        if os.path.exists(os.path.join(p, 'main.py')):
            return p
    return None

# ── request handler ──────────────────────────────────────────────────────────
# ── report helpers ─────────────────────────────────────────────────────────
import base64 as _b64

def _report_key(ro):
    if not ro: return None
    sub = (ro.get('sub') or '').strip('/')
    fn  = ro.get('fn', '')
    return (sub + '/' + fn) if sub else fn


def _get_video_thumb(fp):
    """Extract poster frame at 0.1s via ffmpeg, return data URI or None."""
    import subprocess
    try:
        r = subprocess.run(
            ['ffmpeg', '-ss', '0.1', '-i', fp,
             '-vframes', '1', '-f', 'image2', '-vcodec', 'png',
             '-loglevel', 'error', '-'],
            capture_output=True, timeout=15
        )
        if r.returncode == 0 and r.stdout:
            return 'data:image/png;base64,' + _b64.b64encode(r.stdout).decode('ascii')
    except Exception:
        pass
    return None


def build_report_html(data, media_info):
    """media_info: key → {uri, thumb, path, is_vid, fn}"""
    import html as _h, re as _re
    esc  = _h.escape
    esca = lambda s: _h.escape(str(s), quote=True)

    stamp   = data.get('stamp', '')
    server  = data.get('server', '127.0.0.1:8188')
    order   = data.get('order', [])
    results = data.get('results', [])
    log_txt = data.get('logLines', '')
    ok_n    = sum(1 for r in results if r.get('status') == 'ok')
    chk_n   = sum(1 for r in results if r.get('status') == 'check')
    fail_n  = sum(1 for r in results if r.get('status') not in ('ok', 'check'))
    tot_s   = sum(r.get('secs', 0) for r in results)
    date_s  = stamp.replace('T', ' ')[:19]
    by_name = {}
    for r in results:
        n = r.get('name', '')
        if n not in by_name: by_name[n] = r

    def sc(s):
        return 'ok' if s == 'ok' else 'check' if s == 'check' else 'fail' if s else 'pending'
    def slabel(s):
        if s == 'ok':    return '&#x2713;&nbsp;ok'
        if s == 'check': return '&#x26A0;&nbsp;check'
        if s:            return '&#x2717;&nbsp;' + esc(s)
        return '&mdash;'
    def unit_card(name):
        r = by_name.get(name)
        s = r.get('status') if r else None
        t = f"{r['secs']:.1f}s" if r else '&mdash;'
        cl = sc(s)
        return (f'<div class="uc {cl}"><div class="uc-n" title="{esca(name)}">{esc(name)}</div>'
                f'<div class="uc-s {cl}">{slabel(s)}</div><div class="uc-t">{t}</div></div>')

    rows = []
    for u in order:
        if u.get('type') == 'single':
            rows.append(f'<div class="orow">{unit_card(u["name"])}</div>')
        else:
            mode  = u.get('mode', 'success')
            ml    = '&#x2717;&nbsp;stop on fail' if mode == 'failure' else '&#x2713;&nbsp;stop on succ'
            names = u.get('names', [])
            nodes = ''.join(unit_card(nm) + ('<div class="arr">&#x2192;</div>' if i < len(names)-1 else '') for i,nm in enumerate(names))
            rows.append(f'<div class="orow"><span class="ctag {mode}">{ml}</span>{nodes}</div>')
    order_html = '\n'.join(rows)

    cards = []
    for r in results:
        ro   = r.get('rawOut')
        nm   = r.get('used', r.get('name', ''))
        st   = r.get('status', '')
        sec  = r.get('secs', 0)
        cls  = 'ok' if st == 'ok' else 'check' if st == 'check' else 'fail'
        key  = _report_key(ro)
        info = media_info.get(key, {}) if key else {}
        fn   = info.get('fn', (ro or {}).get('fn', ''))
        uri  = info.get('uri')    # full embedded data URI
        thb  = info.get('thumb')  # poster frame / thumbnail
        path = info.get('path', '')
        is_v = info.get('is_vid', False)

        # card thumbnail display
        if thb:
            card_thumb = (f'<img src="{thb}" loading="lazy">' +
                          ('<div class="rc-play">&#9654;</div>' if is_v else ''))
        elif uri:
            card_thumb = f'<img src="{uri}" loading="lazy">'
        else:
            card_thumb = f'<span class="np" title="{esca(fn)}">{"too large" if fn else "no preview"}</span>'

        # data attributes for lightbox
        da = [f'data-fn="{esca(fn)}"']
        if path: da.append(f'data-path="{esca(path)}"'
                           )
        if is_v: da.append('data-vid="1"')
        # store uri only if present (used for image lightbox full res)
        has_lb = bool(uri or thb or path)
        onclick = 'onclick="lbOpen(this)"' if has_lb else ''

        cards.append(
            f'<div class="rc" {" ".join(da)} {onclick}>'
            f'<div class="rc-thumb">{card_thumb}</div>'
            f'<div class="rc-meta"><div class="rc-name" title="{esca(nm)}">{esc(nm)}</div>'
            f'<div class="rc-stat {cls}">{esc(st)} &middot; {sec:.0f}s</div></div></div>'
        )
    res_html = '\n'.join(cards)

    tpl = _REPORT_TPL
    for k, v in [('__DATE_S__', date_s), ('__SERVER__', esc(server)),
                 ('__OK_N__', str(ok_n)), ('__CHK_N__', str(chk_n)),
                 ('__FAIL_N__', str(fail_n)), ('__TOT_S__', f"{tot_s:.0f}"),
                 ('__ORD_LEN__', str(len(order))), ('__ORDER_HTML__', order_html),
                 ('__RES_LEN__', str(len(results))), ('__RES_HTML__', res_html),
                 ('__LOG_HTML__', esc(log_txt)), ('__DATE_SHORT__', stamp[:10])]:
        tpl = tpl.replace(k, v)
    return tpl


_REPORT_TPL = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Wedge Report &middot; __DATE_SHORT__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0a;--bg2:#0c0c0c;--bg3:#0e0e0e;--b1:#1e1e1e;--b2:#2a2a2a;
  --fg:#e8e4dc;--fg2:#888880;--dim:#555550;
  --gold:#d18d1f;--gdim:#8a5c14;
  --ok:#5ad17a;--warn:#f0b656;--err:#ff6b6b;
}
body{font-family:'DM Mono','Courier New',monospace;background:var(--bg);color:var(--fg);min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(209,141,31,.018) 0px,transparent 1px,transparent 2px,rgba(209,141,31,.018) 3px);pointer-events:none;z-index:1000}
.hdr{padding:18px 32px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between;gap:20px;background:var(--bg2)}
.logo{height:32px}
.ttl{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.stmp{font-size:9px;color:var(--dim);letter-spacing:.08em;margin-top:3px}
.sum{display:flex;gap:18px;align-items:center;font-size:9px;letter-spacing:.1em}
.stat{display:flex;align-items:center;gap:5px}.stat .dot{width:7px;height:7px;border-radius:50%}
.tot{color:var(--dim)}
.sec{padding:22px 32px;border-bottom:1px solid var(--b1)}
.sec-t{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:16px}
.olist{display:flex;flex-direction:column;gap:10px}
.orow{display:flex;align-items:stretch;flex-wrap:wrap;row-gap:6px}
.uc{background:var(--bg3);border:1px solid var(--b2);border-radius:3px;padding:10px 14px;min-width:110px;max-width:180px;display:flex;flex-direction:column;gap:3px}
.uc.ok{border-color:rgba(90,209,122,.45)}
.uc.check{border-color:rgba(209,141,31,.5);background:rgba(209,141,31,.04)}
.uc.fail{border-color:rgba(255,107,107,.45);background:rgba(255,107,107,.04)}
.uc-n{font-size:10px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uc-s{font-size:8px;letter-spacing:.1em;text-transform:uppercase}
.uc-s.ok{color:var(--ok)}.uc-s.check{color:var(--warn)}.uc-s.fail{color:var(--err)}.uc-s.pending{color:var(--dim)}
.uc-t{font-size:8px;color:var(--dim)}
.arr{display:flex;align-items:center;padding:0 8px;color:var(--dim);font-size:14px}
.ctag{font-size:7px;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:2px;border:1px solid var(--b2);color:var(--fg2);align-self:center;margin-right:10px;flex-shrink:0}
.ctag.success{color:var(--ok);border-color:rgba(90,209,122,.3)}
.ctag.failure{color:var(--warn);border-color:rgba(240,182,86,.3)}
.rg{display:flex;flex-wrap:wrap;gap:12px}
.rc{background:var(--bg3);border:1px solid var(--b1);border-radius:4px;overflow:hidden;width:180px;transition:border-color .2s}
.rc[onclick]{cursor:pointer}.rc[onclick]:hover{border-color:var(--gdim)}
.rc-thumb{width:100%;height:101px;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.rc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.rc-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;background:rgba(0,0,0,.35);opacity:0;transition:opacity .2s;pointer-events:none}
.rc[onclick]:hover .rc-play{opacity:1}
.np{font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;padding:8px;text-align:center}
.rc-meta{padding:8px 10px}
.rc-name{font-size:10px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-stat{font-size:9px;margin-top:2px;letter-spacing:.05em}
.rc-stat.ok{color:var(--ok)}.rc-stat.check{color:var(--warn)}.rc-stat.fail{color:var(--err)}
.log-toggle{cursor:pointer;display:inline-flex;align-items:center;gap:8px;user-select:none}
.log-toggle:hover .log-title{color:var(--fg2)}
.log-chv{transition:transform .2s;font-size:10px}
.log-toggle.open .log-chv{transform:rotate(180deg)}
.log-body{display:none;margin-top:14px;background:var(--bg2);border:1px solid var(--b1);border-radius:3px;padding:12px 16px;max-height:380px;overflow-y:auto;font-size:10px;line-height:1.8;white-space:pre-wrap;word-break:break-word;color:var(--fg2)}
.log-body.open{display:block}
.lb{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.93);display:none;flex-direction:column;align-items:center;justify-content:center}
.lb.open{display:flex}
.lb-x{position:absolute;top:16px;right:20px;font-size:22px;color:var(--fg2);cursor:pointer;background:none;border:none;font-family:inherit;z-index:9100;transition:color .2s}
.lb-x:hover{color:var(--fg)}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);font-size:28px;color:var(--fg2);cursor:pointer;background:none;border:none;font-family:inherit;z-index:9100;padding:0 18px;transition:color .2s}
.lb-nav:hover{color:var(--gold)}.lb-p{left:0}.lb-n{right:0}
.lb-ct{max-width:calc(100vw - 120px);max-height:calc(100vh - 90px);display:flex;align-items:center;justify-content:center}
.lb-ct video,.lb-ct img{max-width:100%;max-height:calc(100vh - 90px);border-radius:3px;display:block}
.lb-foot{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 20px;background:linear-gradient(transparent,rgba(0,0,0,.7))}
.lb-mt{font-size:10px;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
.lb-copy{font-family:inherit;font-size:9px;letter-spacing:.08em;padding:3px 10px;background:var(--b2);border:1px solid var(--b1);color:var(--fg2);border-radius:2px;cursor:pointer;transition:color .2s;flex-shrink:0}
.lb-copy:hover{color:var(--gold);border-color:var(--gdim)}
::-webkit-scrollbar{width:8px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--b2);border-radius:4px}
</style>
</head>
<body>

<div class="hdr">
  <div style="display:flex;align-items:center;gap:14px">
    <a href="https://thedistrictzero.com/" target="_blank" rel="noopener" style="line-height:0">
      <img class="logo" src="https://cdn.jsdelivr.net/gh/Gerry-Malta/Prompt_Studio@main/DZ_logo_color_transparent_s.png" alt="DZ" onerror="this.style.display='none'">
    </a>
    <div style="width:1px;height:24px;background:var(--b2)"></div>
    <div>
      <div class="ttl">Wedge Report</div>
      <div class="stmp">__DATE_S__ &middot; __SERVER__</div>
    </div>
  </div>
  <div class="sum">
    <div class="stat"><span class="dot" style="background:var(--ok)"></span><span>__OK_N__ ok</span></div>
    <div class="stat"><span class="dot" style="background:var(--warn)"></span><span>__CHK_N__ check</span></div>
    <div class="stat"><span class="dot" style="background:var(--err)"></span><span>__FAIL_N__ failed</span></div>
    <span class="tot">__TOT_S__s total</span>
  </div>
</div>

<div class="sec">
  <div class="sec-t">Run Order &middot; __ORD_LEN__ unit(s)</div>
  <div class="olist">__ORDER_HTML__</div>
</div>

<div class="sec">
  <div class="sec-t">Results &middot; __RES_LEN__ output(s)</div>
  <div class="rg">__RES_HTML__</div>
</div>

<div class="sec" style="border-bottom:none">
  <div class="sec-t">
    <span class="log-toggle" id="lgT" onclick="toggleLog()">
      <span class="log-title">Log</span>
      <span class="log-chv">&#x25BE;</span>
    </span>
  </div>
  <div class="log-body" id="lgB">__LOG_HTML__</div>
</div>

<div class="lb" id="lb">
  <button class="lb-x" onclick="lbClose()">&#x2715;</button>
  <button class="lb-nav lb-p" onclick="lbNav(-1)">&#x2190;</button>
  <button class="lb-nav lb-n" onclick="lbNav(1)">&#x2192;</button>
  <div class="lb-ct" id="lbCt"></div>
  <div class="lb-foot">
    <div class="lb-mt" id="lbMt"></div>
    <button class="lb-copy" id="lbCopy" style="display:none">copy path</button>
  </div>
</div>

<script>
var cards = Array.from(document.querySelectorAll('.rc[onclick]'));
var lbI   = -1;

function lbOpen(el) {
  var i = cards.indexOf(el);
  if (i < 0) return;
  lbI = i; lbShow();
  document.getElementById('lb').classList.add('open');
}
function lbClose() {
  document.getElementById('lb').classList.remove('open');
  var v = document.querySelector('#lbCt video');
  if (v) v.pause();
}
function lbNav(d) {
  if (!cards.length) return;
  lbI = (lbI + d + cards.length) % cards.length;
  lbShow();
}
function lbShow() {
  var c = cards[lbI]; if (!c) return;
  var isV  = c.dataset.vid === '1';
  var path = c.dataset.path || '';
  var fn   = c.dataset.fn  || '';
  var el   = document.getElementById('lbCt');
  var nm   = c.querySelector('.rc-name');
  var cardImg = c.querySelector('.rc-thumb img');

  // pause any previous video
  var prev = el.querySelector('video');
  if (prev) prev.pause();
  el.innerHTML = '';

  if (isV) {
    // Try to play via file:/// path (works when file is on same machine)
    if (path) {
      var v = document.createElement('video');
      v.controls = true; v.autoplay = true; v.muted = true;
      v.style.cssText = 'max-width:100%;max-height:calc(100vh - 90px);border-radius:3px';
      v.src = 'file:///' + path.replace(/\\/g, '/');
      // On load error fall back to the poster thumbnail
      if (cardImg) {
        v.onerror = function() {
          el.innerHTML = '';
          var img = document.createElement('img');
          img.src = cardImg.src;
          img.style.cssText = 'max-width:100%;max-height:calc(100vh - 90px);border-radius:3px';
          el.appendChild(img);
        };
      }
      el.appendChild(v);
    } else if (cardImg) {
      var img = document.createElement('img');
      img.src = cardImg.src;
      img.style.cssText = 'max-width:100%;max-height:calc(100vh - 90px);border-radius:3px';
      el.appendChild(img);
    }
  } else {
    if (cardImg) {
      var img = document.createElement('img');
      img.src = cardImg.src;
      img.style.cssText = 'max-width:100%;max-height:calc(100vh - 90px);border-radius:3px';
      el.appendChild(img);
    }
  }

  // footer meta + copy button
  document.getElementById('lbMt').textContent = nm ? (nm.title || nm.textContent) : fn;
  var cpBtn = document.getElementById('lbCopy');
  if (path) {
    cpBtn.style.display = 'inline-block';
    cpBtn.dataset.path  = path;
    cpBtn.textContent   = 'copy path';
  } else {
    cpBtn.style.display = 'none';
  }
}

document.getElementById('lbCopy').addEventListener('click', function() {
  var p = this.dataset.path; if (!p) return;
  var btn = this;
  navigator.clipboard.writeText(p).then(function() {
    btn.textContent = 'copied!';
    setTimeout(function() { btn.textContent = 'copy path'; }, 1500);
  }).catch(function() {
    // fallback: select a temp input
    var inp = document.createElement('input');
    inp.value = p; document.body.appendChild(inp);
    inp.select(); document.execCommand('copy');
    document.body.removeChild(inp);
    btn.textContent = 'copied!';
    setTimeout(function() { btn.textContent = 'copy path'; }, 1500);
  });
});

function toggleLog() {
  document.getElementById('lgB').classList.toggle('open');
  document.getElementById('lgT').classList.toggle('open');
}
document.addEventListener('keydown', function(e) {
  if (document.getElementById('lb').classList.contains('open')) {
    if (e.key === 'ArrowLeft')  lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
    if (e.key === 'Escape')     lbClose();
  }
});
</script>
</body>
</html>"""


class WedgeHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else '?'
        path = self.path.split('?')[0]
        # suppress high-frequency and low-value paths
        _quiet = {
            '/', '/wedge_studio.html', '/comfy_proxy/system_stats',
            '/get_config', '/local_output', '/browse', '/list_workflows',
        }
        if path in _quiet or path.startswith('/comfy_proxy/history/'):
            return
        print(f"  {code}  {path}")

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        # serve the main UI
        if path in ('', '/', '/wedge_studio.html', '/wedge_studio'):
            body = HTML.encode('utf-8', errors='replace')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_cors()
            self.end_headers()
            self.wfile.write(body)
            return

        # load wedge config (comfy path, etc)
        if path == '/get_config':
            cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_wedge_config.json')
            try:
                cfg = json.loads(open(cfg_file).read()) if os.path.exists(cfg_file) else {}
                # auto-detect ComfyUI path if not saved yet
                if not cfg.get('comfy_path'):
                    detected = _detect_comfy_path()
                    if detected:
                        cfg['comfy_path'] = detected
                        print(f'  Auto-detected ComfyUI path: {detected}')
                        try: open(cfg_file,'w').write(json.dumps(cfg, indent=2))
                        except Exception: pass
                    else:
                        print('  ComfyUI path not set — enter it in the header field.')
                else:
                    print(f'  ComfyUI path: {cfg["comfy_path"]}')
                self._json_ok(cfg)
            except Exception as e:
                self._json_error(str(e))
            return

        # browse directory tree (for folder picker)
        if path == '/browse':
            qs = parse_qs(parsed.query)
            folder = unquote(qs.get('folder', ['.'])[0])
            try:
                p = Path(folder).resolve()
                # get parent chain for breadcrumb
                parents = []
                cur = p
                for _ in range(10):
                    par = cur.parent
                    if par == cur: break
                    parents.insert(0, {'name': cur.name or str(cur), 'path': str(cur)})
                    cur = par
                parents.insert(0, {'name': str(cur), 'path': str(cur)})
                # list subdirectories
                subdirs = sorted(
                    [{'name': d.name, 'path': str(d)} for d in p.iterdir() if d.is_dir() and not d.name.startswith('.')],
                    key=lambda x: x['name'].lower()
                )
                # count .json files
                json_count = len([f for f in p.iterdir() if f.suffix.lower() == '.json'])
                body = json.dumps({'ok': True, 'current': str(p), 'parents': parents,
                                   'subdirs': subdirs, 'json_count': json_count}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self._json_error(str(e))
            return

        # list .json files in a directory
        if path == '/list_workflows':
            qs = parse_qs(parsed.query)
            folder = qs.get('folder', ['.'])[0]
            folder = unquote(folder)
            try:
                # '.' means default: use the script's own directory,
                # NOT os.getcwd() which changes depending on where you
                # launched the .py from.
                script_dir = Path(os.path.abspath(__file__)).parent
                p = script_dir if folder == '.' else Path(folder).resolve()
                files = sorted(
                    [f.name for f in p.iterdir() if f.suffix.lower() == '.json'],
                    key=str.lower
                )
                body = json.dumps({'ok': True, 'folder': str(p), 'files': files}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self._json_error(str(e))
            return


        # serve output files directly from ComfyUI output folder (for report media)
        if path == '/local_output':
            qs = parse_qs(parsed.query)
            filename  = unquote(qs.get('filename',  [''])[0])
            subfolder = unquote(qs.get('subfolder', [''])[0])
            ftype     = unquote(qs.get('type',      ['output'])[0])
            if not filename:
                self._json_error('filename required'); return
            cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_wedge_config.json')
            try:
                cfg = json.loads(open(cfg_file).read()) if os.path.exists(cfg_file) else {}
            except Exception:
                cfg = {}
            comfy_path = cfg.get('comfy_path', '')
            if not comfy_path:
                self._json_error('ComfyUI path not configured — set it in the header and click ✓'); return
            output_root = os.path.join(comfy_path, ftype if ftype in ('output','input','temp') else 'output')
            file_path = os.path.join(output_root, subfolder, filename) if subfolder else os.path.join(output_root, filename)
            file_path = os.path.normpath(file_path)
            # safety: must stay inside the output root
            if not file_path.startswith(os.path.normpath(comfy_path)):
                self._json_error('path outside ComfyUI folder'); return
            try:
                with open(file_path, 'rb') as fh:
                    data = fh.read()
                mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_cors()
                self.end_headers()
                self.wfile.write(data)
            except FileNotFoundError:
                self._json_error(f'file not found: {file_path}')
            except Exception as e:
                self._json_error(str(e))
            return

        # proxy ComfyUI GET calls
        if path.startswith('/comfy_proxy/'):
            import urllib.request as _ur
            comfy_path = path[len('/comfy_proxy'):]
            qs = parsed.query
            comfy_url = f'http://127.0.0.1:8188{comfy_path}' + (f'?{qs}' if qs else '')
            try:
                with _ur.urlopen(comfy_url, timeout=5) as resp:
                    rbody = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', resp.headers.get('Content-Type','application/json'))
                    self.send_cors()
                    self.end_headers()
                    self.wfile.write(rbody)
            except Exception as e:
                self._json_error(f'ComfyUI unreachable: {e}')
            return

        # read a workflow file
        if path == '/read_workflow':
            qs = parse_qs(parsed.query)
            filepath = unquote(qs.get('path', [''])[0])
            try:
                content = Path(filepath).read_text(encoding='utf-8')
                body = json.dumps({'ok': True, 'content': content}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self._json_error(str(e))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n)

        # restart ComfyUI (kill + relaunch)
        if path == '/restart_comfy':
            try:
                data = json.loads(body) if body else {}
                comfy_path = data.get('comfy_path', '').strip() or os.getcwd()
                comfy_path = os.path.abspath(comfy_path)

                import signal as _signal

                # save path for future use
                cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_wedge_config.json')
                try:
                    cfg = json.loads(open(cfg_file).read()) if os.path.exists(cfg_file) else {}
                    cfg['comfy_path'] = comfy_path
                    open(cfg_file, 'w').write(json.dumps(cfg, indent=2))
                except Exception: pass

                # find ComfyUI process — target specific PID, never kill all python
                killed = False
                try:
                    import psutil
                    our_pid = os.getpid()  # wedge_studio.py PID — never kill this
                    candidates = []
                    for proc in psutil.process_iter(['pid','name','cmdline','cwd']):
                        try:
                            if proc.pid == our_pid: continue  # never kill ourselves
                            cmd = ' '.join(proc.info['cmdline'] or [])
                            cwd = (proc.info['cwd'] or '').lower()
                            if 'main.py' in cmd and (
                                comfy_path.lower() in cwd or
                                'comfyui' in cmd.lower() or
                                'comfyui' in cwd
                            ):
                                candidates.append(proc)
                        except Exception: pass
                    if candidates:
                        # kill the best match (most recently started)
                        target = sorted(candidates, key=lambda p: p.create_time())[-1]
                        print(f'  Killing ComfyUI PID {target.pid} (cmd: {" ".join(target.cmdline()[:3])})')
                        target.kill()
                        target.wait(timeout=5)
                        killed = True
                    else:
                        print('  No ComfyUI process found via psutil')
                except ImportError:
                    # psutil not available — use targeted taskkill by window title
                    if sys.platform.startswith('win'):
                        # kill by window title pattern, NOT /IM python.exe (would kill wedge too)
                        result = os.system('taskkill /F /FI "WINDOWTITLE eq *ComfyUI*" 2>nul')
                        killed = (result == 0)
                        if not killed:
                            print('  taskkill by window title failed — install psutil for reliable kills')
                            print('  Run: pip install psutil --break-system-packages')

                import time as _time
                _time.sleep(2)

                # relaunch ComfyUI
                main_py = os.path.join(comfy_path, 'main.py')
                if not os.path.exists(main_py):
                    self._json_error(f'main.py not found at {comfy_path}')
                    return

                # find python in the comfy venv or system
                venv_py = os.path.join(comfy_path, 'venv', 'Scripts', 'python.exe')
                emb_py  = os.path.join(comfy_path, 'python_embeded', 'python.exe')
                if os.path.exists(venv_py):
                    python_exe = venv_py
                elif os.path.exists(emb_py):
                    python_exe = emb_py
                else:
                    python_exe = sys.executable

                import subprocess as _sp
                _sp.Popen(
                    [python_exe, main_py, '--enable-cors-header', '*'],
                    cwd=comfy_path,
                    creationflags=_sp.CREATE_NEW_CONSOLE if sys.platform.startswith('win') else 0
                )
                print(f'  ComfyUI relaunching from {comfy_path}')
                self._json_ok({'killed': killed, 'relaunched': True, 'path': comfy_path})
            except Exception as e:
                self._json_error(str(e))
            return



        # save config
        if path == '/save_config':
            cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_wedge_config.json')
            try:
                data = json.loads(body)
                existing = json.loads(open(cfg_file).read()) if os.path.exists(cfg_file) else {}
                existing.update(data)
                open(cfg_file, 'w').write(json.dumps(existing, indent=2))
                self._json_ok()
            except Exception as e:
                self._json_error(str(e))
            return

        # save report HTML to disk


        if path == '/generate_report':
            try:
                data = json.loads(body)
            except Exception as e:
                self._json_error(f'bad JSON: {e}'); return
            cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_wedge_config.json')
            try:
                cfg = json.loads(open(cfg_file).read()) if os.path.exists(cfg_file) else {}
            except Exception:
                cfg = {}
            comfy_path = cfg.get('comfy_path', '')
            media_info = {}
            MAX_EMBED  = 50 * 1024 * 1024  # 50 MB
            for r in data.get('results', []):
                ro    = r.get('rawOut')
                if not ro: continue
                fn    = ro.get('fn', '')
                sub   = (ro.get('sub') or '').strip('/')
                ftype = ro.get('type', 'output')
                key   = _report_key(ro)
                if not fn or not key: continue
                import re as _re
                is_v = bool(_re.search(r'\.(mp4|webm|mov)$', fn, _re.I))
                info = {'uri': None, 'thumb': None, 'path': None, 'is_vid': is_v, 'fn': fn}
                if comfy_path:
                    root = os.path.join(comfy_path, ftype if ftype in ('output','input','temp') else 'output')
                    fp   = os.path.normpath(os.path.join(root, sub, fn) if sub else os.path.join(root, fn))
                    if fp.startswith(os.path.normpath(comfy_path)):
                        info['path'] = fp
                        try:
                            fsize = os.path.getsize(fp)
                            if fsize <= MAX_EMBED:
                                with open(fp, 'rb') as fh: raw = fh.read()
                                mime = mimetypes.guess_type(fn)[0] or 'application/octet-stream'
                                info['uri'] = 'data:' + mime + ';base64,' + _b64.b64encode(raw).decode('ascii')
                                if not is_v:
                                    info['thumb'] = info['uri']
                            if is_v:
                                info['thumb'] = _get_video_thumb(fp)
                        except Exception:
                            pass
                media_info[key] = info
            try:
                html_content = build_report_html(data, media_info)
            except Exception as e:
                self._json_error(f'build error: {e}'); return
            save_path = data.get('path', '')
            if not save_path:
                self._json_error('no path'); return
            try:
                sp = Path(save_path).resolve()
                sp.parent.mkdir(parents=True, exist_ok=True)
                sp.write_text(html_content, encoding='utf-8')
                self._json_ok({'path': str(sp)})
            except Exception as e:
                self._json_error(f'save failed: {e}')
            return

        if path == '/save_report':
            try:
                data = json.loads(body)
                save_path = Path(data['path']).resolve()
                html_content = data['html']
                save_path.parent.mkdir(parents=True, exist_ok=True)
                save_path.write_text(html_content, encoding='utf-8')
                print(f"  Report saved: {save_path}")
                self._json_ok({'saved': str(save_path)})
            except Exception as e:
                self._json_error(str(e))
            return

        # proxy ComfyUI API calls (avoids CORS cross-port issues)
        if path.startswith('/comfy_proxy/'):
            import urllib.request as _ur
            comfy_path = path[len('/comfy_proxy'):]  # e.g. /system_stats
            comfy_url = f'http://127.0.0.1:8188{comfy_path}'
            # /free can take a while to unload models — give it more time
            _proxy_timeout = 30 if comfy_path == '/free' else 5
            try:
                req = _ur.Request(comfy_url, data=body or None,
                    headers={'Content-Type': self.headers.get('Content-Type','application/json')},
                    method=self.command)
                with _ur.urlopen(req, timeout=_proxy_timeout) as resp:
                    rbody = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', resp.headers.get('Content-Type','application/json'))
                    self.send_cors()
                    self.end_headers()
                    self.wfile.write(rbody)
            except Exception as e:
                self._json_error(f'ComfyUI unreachable: {e}')
            return

        # read multiple workflow files at once
        if path == '/read_workflows':
            try:
                data = json.loads(body)
                folder = Path(data['folder']).resolve()
                results = {}
                for fname in data.get('files', []):
                    try:
                        content = (folder / fname).read_text(encoding='utf-8')
                        results[fname] = {'ok': True, 'content': content}
                    except Exception as e:
                        results[fname] = {'ok': False, 'error': str(e)}
                self._json_ok({'workflows': results})
            except Exception as e:
                self._json_error(str(e))
            return

        self.send_response(404)
        self.end_headers()

    def _json_ok(self, data=None):
        payload = json.dumps({'ok': True, **(data or {})}).encode()
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_cors()
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _json_error(self, msg):
        payload = json.dumps({'ok': False, 'error': msg}).encode()
        try:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_cors()
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass


# ── main ─────────────────────────────────────────────────────────────────────
class WedgeServer(HTTPServer):
    """HTTPServer that silently drops client-disconnect tracebacks on Windows."""
    def handle_error(self, request, client_address):
        import sys
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, BrokenPipeError, ConnectionResetError)):
            return  # client dropped the connection — nothing to log
        super().handle_error(request, client_address)

if __name__ == '__main__':
    server = WedgeServer(('', PORT), WedgeHandler)
    url = f'http://localhost:{PORT}/'
    print()
    print('  ╔══════════════════════════════════════════╗')
    print(f'  ║   Wedge Studio — District Zero           ║')
    print(f'  ║   http://localhost:{PORT}/                 ║')
    print('  ║   Ctrl+C to stop                         ║')
    print('  ╔══════════════════════════════════════════╗')
    print()

    # open browser after short delay
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        print('  Wedge Studio stopped.')
        server.server_close()
