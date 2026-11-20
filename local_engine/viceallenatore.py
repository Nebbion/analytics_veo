#!/usr/bin/env python3
"""Local, offline media importer for Villanovese Analytics. No original is uploaded."""
import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import uuid
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "local" / "matches"
EVENT_SCHEMA = json.loads((ROOT / "docs" / "viceallenatore" / "event-contract.json").read_text(encoding="utf-8"))
SCHEMA_VERSION = EVENT_SCHEMA["properties"]["schema_version"]["const"]
MAX_REPORT_BYTES = 50 * 1024 * 1024


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg"):
            self.hidden += 1
        if tag in ("p", "div", "tr", "li", "br", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg"):
            self.hidden = max(0, self.hidden - 1)
        if tag in ("p", "div", "tr", "li"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def match_dir(match_id):
    # The canonical ID can contain punctuation, but never become a path component.
    if not match_id or len(match_id) > 200:
        raise ValueError("Invalid match ID")
    return DATA / hashlib.sha256(match_id.encode()).hexdigest()[:24]


def database(match_id):
    folder = match_dir(match_id)
    folder.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(folder / "manifest.sqlite3")
    db.row_factory = sqlite3.Row
    db.executescript("""
      create table if not exists sources(
        id text primary key, match_id text not null, provider text not null,
        kind text not null, filename text not null, local_path text not null,
        sha256 text not null, size_bytes integer not null, metadata text not null,
        imported_at text not null default (datetime('now')),
        unique(match_id,sha256));
      create table if not exists events(
        id text primary key, match_id text not null, source_id text,
        video_start_ms integer, video_end_ms integer, game_minute integer,
        game_stoppage integer, clock_mapping_verified integer not null default 0,
        period text not null default 'unknown', event_type text not null,
        phase text not null default 'unknown', zone text, player_id text,
        observability text not null default 'not_observable',
        relevance text not null default 'undetermined', description text not null,
        claim_type text not null default 'osservazione',
        review_status text not null default 'proposed',
        created_at text not null default (datetime('now')),
        foreign key(source_id) references sources(id),
        check(video_start_ms is null or video_end_ms >= video_start_ms));
      create table if not exists decisions(
        id text primary key, match_id text not null, field text not null,
        source_a_id text not null, value_a text not null,
        source_b_id text not null, value_b text not null,
        approved_value text, reason text, status text not null default 'pending',
        created_at text not null default (datetime('now')));
    """)
    db.execute("pragma foreign_keys=on")
    return db


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_command(argv):
    if not shutil.which(argv[0]):
        raise RuntimeError(f"Missing executable: {argv[0]}")
    return subprocess.run(argv, check=True, capture_output=True, text=True).stdout


def probe(path):
    raw = run_command(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)])
    info = json.loads(raw)
    stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if not stream:
        raise ValueError("No video stream")
    return {"duration_ms": round(float(info["format"]["duration"]) * 1000),
            "width": int(stream["width"]), "height": int(stream["height"]),
            "codec": stream.get("codec_name")}


def mhtml_text(path):
    if path.stat().st_size > MAX_REPORT_BYTES:
        raise ValueError("MHTML too large")
    message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
    if not message.is_multipart() and message.get_content_type() not in ("text/html", "text/plain"):
        raise ValueError("Not a readable MHTML report")
    texts = []
    for part in message.walk():
        if part.get_content_type() not in ("text/html", "text/plain"):
            continue
        try:
            content = part.get_content()
        except (UnicodeError, LookupError):
            continue
        if part.get_content_type() == "text/html":
            parser = VisibleText()
            parser.feed(content)
            content = "".join(parser.parts)
        texts.append(content)
    lines = [" ".join(line.split()) for text in texts for line in text.splitlines()]
    return [line for line in lines if line]


def goal_candidates(lines):
    minute_pattern = r"(?<!\d)(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[′'’°]"
    def candidate(match, excerpt, context):
        return {"minute": int(match.group(1)), "stoppage": int(match.group(2) or 0),
                "excerpt": excerpt[:300], "context": context, "status": "candidate_unverified"}
    timeline = []
    for index, line in enumerate(lines):
        if not re.search(r"\b(?:gol di|goal by|goal scored)\b", line, re.I):
            continue
        direct = re.search(minute_pattern, line)
        previous = lines[index - 1] if index else ""
        adjacent = re.fullmatch(r"\s*" + minute_pattern + r"\s*", previous)
        found = direct or adjacent
        if found:
            timeline.append(candidate(found, f"{previous} {line}" if adjacent else line, "timeline"))
    if timeline:
        return timeline[:100]
    summary = []
    for index, line in enumerate(lines):
        if not re.search(r"\b(?:gol fatti|gol subiti)\b", line, re.I):
            continue
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        found = re.search(minute_pattern, next_line)
        if found:
            summary.append(candidate(found, f"{line} {next_line}", "summary"))
    if summary:
        return summary[:100]
    # Veo's scorecard can list scorers as "Jersey #7 (12')" without a goal label.
    # Restrict this pattern to the compact scorecard before the report sections.
    scorecard = []
    score_line = next((i for i, line in enumerate(lines)
                       if re.search(r"\b\d+\s*[-–]\s*\d+\b", line)), None)
    if score_line is not None:
        for line in lines[score_line + 1:score_line + 25]:
            if re.search(r"\b(?:Panoramica|Overview)\b", line, re.I):
                break
            if re.fullmatch(r"(?:Jersey|Maglia)\s*#\d+\s*\(" + minute_pattern + r"\)", line, re.I):
                found = re.search(minute_pattern, line)
                scorecard.append(candidate(found, line, "scorecard_scorer"))
    if scorecard:
        return scorecard[:100]
    generic = []
    for line in lines:
        if re.search(r"\b(?:gol|goal|rete)\b", line, re.I):
            found = re.search(minute_pattern, line)
            if found:
                generic.append(candidate(found, line, "generic"))
    return generic[:100]


def veo_kpi_candidates(lines):
    labels = {"Gol", "Tiri totali", "Calci d'angolo", "Falli", "Calci di punizione",
              "Possesso", "Passaggi totali", "Passaggi riusciti", "Precisione passaggi"}
    start = next((i for i, line in enumerate(lines) if line == "Numeri chiave di entrambe le squadre"), None)
    if start is None:
        return []
    result = []
    for i in range(start + 1, min(len(lines) - 2, start + 45)):
        if lines[i] not in labels:
            continue
        if not (re.fullmatch(r"\d+(?:[.,]\d+)?%?", lines[i+1]) and
                re.fullmatch(r"\d+(?:[.,]\d+)?%?", lines[i+2])):
            continue
        result.append({"metric": lines[i], "first_value": lines[i+1],
                       "second_value": lines[i+2], "status": "candidate_unverified",
                       "context": "veo_team_comparison"})
    return result


def youcoach_timeline_candidates(lines):
    minute_pattern = r"(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[′'’°]"
    result = []
    for i in range(len(lines) - 1):
        found = re.fullmatch(minute_pattern, lines[i])
        if not found:
            continue
        next_line = lines[i+1]
        if re.search(r"^Gol di\b", next_line, re.I):
            kind = "goal"
        elif re.search(r"^Cartellino (?:Giallo|Rosso)\b", next_line, re.I):
            kind = "card"
        elif re.search(r"^Sostituzione\b", next_line, re.I):
            kind = "substitution"
        else:
            continue
        excerpt = next_line
        if kind == "substitution" and i + 2 < len(lines) and not re.fullmatch(minute_pattern, lines[i+2]):
            excerpt = f"{next_line}: {lines[i+2]}"
        result.append({"minute": int(found.group(1)), "stoppage": int(found.group(2) or 0),
                       "event_type": kind, "excerpt": excerpt[:250],
                       "status": "candidate_unverified"})
    return result[:200]


def mhtml_metadata(path, provider):
    lines = mhtml_text(path)
    metadata = {"line_count": len(lines), "goal_candidates": goal_candidates(lines),
                "notice": "Candidates require staff review; pre-match list is not an official lineup.",
                "extractor_version": 3}
    if provider == "veo":
        metadata["kpi_candidates"] = veo_kpi_candidates(lines)
    elif provider == "youcoach":
        metadata["timeline_candidates"] = youcoach_timeline_candidates(lines)
    return metadata


def pdf_pages(path, destination):
    try:
        import pymupdf
    except ImportError as exc:
        raise RuntimeError("Install PyMuPDF in the local venv for PDF import") from exc
    doc = pymupdf.open(path)
    if not doc.is_pdf or doc.needs_pass:
        raise ValueError("PDF invalid or password protected")
    destination.mkdir(exist_ok=True)
    pages = []
    for number, page in enumerate(doc, 1):
        preview = destination / f"page-{number:03}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False).save(preview)
        pages.append({"page": number, "text": page.get_text()[:20000], "preview": preview.name})
    return pages


def has_pdf_header(path):
    with path.open("rb") as stream:
        return stream.read(5) == b"%PDF-"


def add_source(match_id, provider, kind, supplied):
    path = Path(supplied).expanduser().resolve(strict=True)
    if not path.is_file():
        raise ValueError("Source must be a regular file")
    if kind == "video" and path.suffix.lower() not in (".mp4", ".mov"):
        raise ValueError("Video must be MP4 or MOV")
    if kind == "mhtml" and path.suffix.lower() not in (".mhtml", ".mht"):
        raise ValueError("Report must be MHTML")
    if kind == "pdf" and (path.suffix.lower() != ".pdf" or not has_pdf_header(path)):
        raise ValueError("Invalid PDF")
    digest = sha256(path)
    db = database(match_id)
    previous = db.execute("select * from sources where match_id=? and sha256=?", (match_id, digest)).fetchone()
    if previous:
        if previous["kind"] != kind or previous["provider"] != provider:
            db.close()
            raise ValueError("Existing file hash belongs to a different source type or provider")
        if kind == "mhtml" and previous["kind"] == "mhtml":
            metadata = mhtml_metadata(path, provider)
            db.execute("update sources set metadata=? where id=?", (json.dumps(metadata), previous["id"]))
            db.commit()
            previous = db.execute("select * from sources where id=?", (previous["id"],)).fetchone()
        result = dict(previous)
        db.close()
        return result
    metadata = {}
    if kind == "video":
        metadata = probe(path)
    elif kind == "mhtml":
        metadata = mhtml_metadata(path, provider)
    else:
        metadata = {"pages": pdf_pages(path, match_dir(match_id) / f"pdf-{digest[:12]}")}
    source_id = str(uuid.uuid4())
    db.execute("insert into sources(id,match_id,provider,kind,filename,local_path,sha256,size_bytes,metadata) values(?,?,?,?,?,?,?,?,?)",
               (source_id, match_id, provider, kind, path.name, str(path), digest, path.stat().st_size, json.dumps(metadata)))
    db.commit()
    row = db.execute("select * from sources where id=?", (source_id,)).fetchone()
    result = dict(row)
    db.close()
    return result


def relink_source(match_id, source_id, supplied):
    """Remap a moved local original after verifying its content is identical."""
    path = Path(supplied).expanduser().resolve(strict=True)
    if not path.is_file():
        raise ValueError("Source must be a regular file")
    db = database(match_id)
    row = db.execute("select id,sha256,size_bytes from sources where id=? and match_id=?",
                     (source_id, match_id)).fetchone()
    if not row:
        db.close()
        raise ValueError("Source not found for match")
    if path.stat().st_size != row["size_bytes"] or sha256(path) != row["sha256"]:
        db.close()
        raise ValueError("Replacement file does not match the recorded SHA-256")
    db.execute("update sources set local_path=? where id=?", (str(path), source_id))
    db.commit()
    db.close()
    return {"source_id": source_id, "match_id": match_id, "sha256_verified": True}


def make_proxy(match_id, source_id):
    db = database(match_id)
    row = db.execute("select * from sources where id=? and match_id=? and kind='video'", (source_id, match_id)).fetchone()
    if not row:
        db.close()
        raise ValueError("Video source not found")
    target = match_dir(match_id) / f"proxy-{source_id}.mp4"
    if target.exists():
        db.close()
        return str(target)
    temp = target.with_suffix(".partial.mp4")
    run_command(["ffmpeg", "-nostdin", "-v", "error", "-i", row["local_path"],
                 "-vf", "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", "-y", str(temp)])
    temp.replace(target)
    db.close()
    return str(target)


def make_clip(match_id, source_id, start_ms, end_ms):
    if start_ms < 0 or end_ms <= start_ms:
        raise ValueError("Invalid clip interval")
    db = database(match_id)
    row = db.execute("select * from sources where id=? and match_id=? and kind='video'", (source_id, match_id)).fetchone()
    if not row:
        db.close()
        raise ValueError("Video source not found")
    duration = json.loads(row["metadata"])["duration_ms"]
    if end_ms > duration:
        db.close()
        raise ValueError("Clip exceeds source duration")
    target = match_dir(match_id) / f"clip-{source_id}-{start_ms}-{end_ms}.mp4"
    if not target.exists():
        temp = target.with_suffix(".partial.mp4")
        run_command(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{start_ms/1000:.3f}",
                     "-i", row["local_path"], "-t", f"{(end_ms-start_ms)/1000:.3f}",
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-y", str(temp)])
        temp.replace(target)
    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError("Clip output missing")
    digest = sha256(target)
    existing = db.execute("select id from sources where match_id=? and sha256=?", (match_id, digest)).fetchone()
    if not existing:
        db.execute("insert into sources(id,match_id,provider,kind,filename,local_path,sha256,size_bytes,metadata) values(?,?,?,?,?,?,?,?,?)",
                   (str(uuid.uuid4()), match_id, "staff", "clip", target.name, str(target), digest,
                    target.stat().st_size, json.dumps({"origin_source_id": source_id, "start_ms": start_ms, "end_ms": end_ms})))
        db.commit()
    db.close()
    return str(target)


def canonical_event(row, source_kind="video"):
    """Adapter from the local SQLite row to the one versioned event contract."""
    row = dict(row)
    source_refs = [{"source_id": row["source_id"], "kind": source_kind,
                    "start_ms": row["video_start_ms"], "end_ms": row["video_end_ms"]}] if row["source_id"] else []
    event = {
        "schema_version": SCHEMA_VERSION, "analysis_pipeline_version": "manual-1",
        "event_id": row["id"], "match_id": row["match_id"], "season_id": None,
        "period": row["period"], "video_start_ms": row["video_start_ms"],
        "video_end_ms": row["video_end_ms"],
        "game_clock": {"minute": row["game_minute"], "stoppage": row["game_stoppage"],
                       "mapping_verified": bool(row["clock_mapping_verified"])},
        "event_type": row["event_type"], "phase": row["phase"], "zone": row["zone"],
        "team_id": None, "player_ids": [row["player_id"]] if row["player_id"] else [],
        "observability": row["observability"], "relevance": row["relevance"],
        "source_refs": source_refs, "principle_ref": None,
        "claims": [{"type": row["claim_type"], "text": row["description"],
                    "review_status": row["review_status"], "confidence": "unknown",
                    "evidence_quality": "unknown"}],
        "assessment": {"plan_compliance": "non_valutabile", "technical_quality": "non_valutabile",
                       "review_status": "proposed"},
        "sync": {"origin": "local", "revision": 1},
    }
    if set(EVENT_SCHEMA["required"]) - set(event):
        raise ValueError("Event contract fields missing")
    if event["observability"] not in EVENT_SCHEMA["properties"]["observability"]["enum"]:
        raise ValueError("Invalid observability")
    if event["video_start_ms"] is not None and event["video_end_ms"] < event["video_start_ms"]:
        raise ValueError("Invalid event interval")
    return event


def annotate(match_id, source_id, start_ms, end_ms, description, period="unknown", minute=None):
    if start_ms < 0 or end_ms < start_ms or not description.strip():
        raise ValueError("Invalid annotation")
    if period not in ("first_half", "second_half", "extra_time", "unknown"):
        raise ValueError("Invalid period")
    db = database(match_id)
    source = db.execute("select id from sources where id=? and match_id=? and kind='video'", (source_id,match_id)).fetchone()
    if not source:
        db.close()
        raise ValueError("Video source not found")
    event_id = str(uuid.uuid4())
    db.execute("insert into events(id,match_id,source_id,video_start_ms,video_end_ms,game_minute,period,event_type,description,observability,relevance) values(?,?,?,?,?,?,?,?,?,?,?)",
               (event_id,match_id,source_id,start_ms,end_ms,minute,period,"other",description.strip(),"observable","undetermined"))
    db.commit()
    row = db.execute("select * from events where id=?", (event_id,)).fetchone()
    result = canonical_event(row)
    db.close()
    return result


def export_bundle(match_id, target):
    db = database(match_id)
    sources = []
    for row in db.execute("select * from sources where match_id=?", (match_id,)):
        item = dict(row)
        item.pop("local_path")
        local_meta = json.loads(item["metadata"])
        permitted = {
            "video": ("duration_ms", "width", "height", "codec"),
            "mhtml": ("line_count", "goal_candidates", "kpi_candidates", "timeline_candidates", "notice", "extractor_version"),
            "pdf": ("page_count",),
            "clip": ("origin_source_id", "start_ms", "end_ms"),
        }.get(item["kind"], ())
        if item["kind"] == "pdf":
            local_meta["page_count"] = len(local_meta.get("pages", []))
        item["metadata"] = {key: local_meta[key] for key in permitted if key in local_meta}
        sources.append(item)
    events = [canonical_event(row) for row in db.execute("select * from events where match_id=?", (match_id,))]
    decisions = [dict(row) for row in db.execute("select * from decisions where match_id=?", (match_id,))]
    bundle = {"schema_version": SCHEMA_VERSION, "match_id": match_id,
              "sources": sources, "events": events, "reconciliation": decisions}
    Path(target).write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    db.close()
    return bundle


def render_report(input_path, output_path):
    """Render an exported staff review snapshot; never infer missing findings."""
    from xml.sax.saxutils import escape
    try:
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, KeepTogether
    except ImportError as exc:
        raise RuntimeError("Install ReportLab in the local venv for PDF reports") from exc
    data = json.loads(Path(input_path).read_text(encoding="utf-8"))
    if data.get("schema_version") != SCHEMA_VERSION or not data.get("match_id"):
        raise ValueError("Invalid report export")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=colors.HexColor("#18452a"), spaceAfter=12))
    styles.add(ParagraphStyle(name="ReportSection", parent=styles["Heading2"], fontSize=12, leading=15, textColor=colors.HexColor("#18452a"), spaceBefore=14, spaceAfter=6, keepWithNext=True))
    styles.add(ParagraphStyle(name="ReportBody", parent=styles["BodyText"], fontSize=9, leading=13, alignment=TA_LEFT, spaceAfter=5))
    story = []
    def p(value):
        story.append(Paragraph(escape(str(value or "—")), styles["ReportBody"]))
    def section(title):
        story.append(Paragraph(escape(title), styles["ReportSection"]))
    story.append(Paragraph("Villanovese · Viceallenatore AI", styles["ReportTitle"]))
    p(f"Partita: {data.get('match_name') or data['match_id']} · ID {data['match_id']}")
    p("Report di annotazioni e revisioni staff. Il campione può essere incompleto o distorto. Osservazioni, interpretazioni e ipotesi restano distinte.")
    if not data.get("approved_plan_version"):
        p("Documento diagnostico delle fonti: nessun piano gara approvato e nessuna conclusione di conformità tattica.")
    section("Fonti e provenienza")
    sources = data.get("sources", [])
    if not sources: p("Nessuna fonte importata.")
    for source in sources:
        p(f"{source.get('provider','?')} · {source.get('kind','?')} · {source.get('filename','?')} · SHA-256 {source.get('sha256','?')}")
    def source_metadata(provider):
        source = next((s for s in sources if s.get("provider") == provider and s.get("kind") == "mhtml"), {})
        return source.get("extracted_metadata") or source.get("metadata") or {}
    veo_meta, youcoach_meta = source_metadata("veo"), source_metadata("youcoach")
    veo_goals = veo_meta.get("goal_candidates") or []
    youcoach_goals = youcoach_meta.get("goal_candidates") or []
    if veo_goals and youcoach_goals and veo_goals[0].get("minute") != youcoach_goals[0].get("minute"):
        section("Incongruenze tra fonti")
        p(f"Primo gol candidato: Veo {veo_goals[0]['minute']}′; YouCoach {youcoach_goals[0]['minute']}′. Entrambi i valori richiedono verifica staff; nessun tempo video è dedotto dal minuto gara.")
        decisions = data.get("reconciliations") or data.get("reconciliation") or []
        reviewed = next((r for r in decisions if r.get("field_name", r.get("field")) == "first_goal_minute" and r.get("status") == "approved"), None)
        if reviewed:
            p(f"Valore consolidato dallo staff: {reviewed.get('approved_value')}′ · motivo: {reviewed.get('reason') or 'non registrato'}")
        else:
            p("Conflitto ancora aperto: valore consolidato non approvato.")
    veo_kpis = veo_meta.get("kpi_candidates") or []
    timeline = youcoach_meta.get("timeline_candidates") or []
    if veo_kpis or timeline:
        section("Dati dei report da verificare")
        if veo_kpis:
            p("Veo: prima / seconda colonna del report. Attribuzione, periodo e metodo richiedono revisione staff.")
            for item in veo_kpis:
                p(f"{item.get('metric')}: {item.get('first_value')} / {item.get('second_value')}")
        if timeline:
            p(f"YouCoach: {len(timeline)} eventi di cronaca candidati; nessun timestamp video o ID giocatore viene dedotto.")
            for item in timeline[:30]:
                p(f"{item.get('minute')}′ · {item.get('event_type')} · {item.get('excerpt')}")
    section("Piano gara e conformità")
    p(f"Versione modello stagionale: {data.get('approved_model_version') or 'nessuna'} · hash {data.get('approved_model_hash') or '—'}")
    p(f"Versione piano approvata: {data.get('approved_plan_version') or 'nessuna'} · hash {data.get('approved_plan_hash') or '—'}")
    compliance = data.get("compliance", {})
    denominator = int(compliance.get("denominator", 0))
    p(f"Campione giudicato: {denominator}; conformi {compliance.get('conforme',0)}/{denominator}; non conformi {compliance.get('non_conforme',0)}/{denominator}; adattamenti {compliance.get('adattamenti',0)}/{denominator}; non valutabili esclusi {compliance.get('non_valutabili',0)}.")
    for segment in data.get("clock_segments", []):
        p(f"Tratto cronometro verificato: {segment.get('period')} · video {segment.get('video_start_ms')}–{segment.get('video_end_ms')} ms · gara da {segment.get('game_start_minute')}′ · {segment.get('notes')}")
    section("Episodi e claims")
    for event in data.get("events", []):
        p(f"Osservazione · video {event.get('video_start_ms')}–{event.get('video_end_ms')} ms · minuto gara {event.get('game_minute') if event.get('clock_mapping_verified') else 'non sincronizzato'} · {event.get('description','')} · ID {event.get('id')} · fonte {event.get('source_id') or 'assente'}")
    if not data.get("events"): p("Nessun episodio verificato.")
    for claim in data.get("claims", []):
        p(f"{claim.get('claim_type','?')} · {claim.get('claim_text','')} · confidenza {claim.get('confidence','?')} · revisione {claim.get('review_status','?')} · evento {claim.get('event_id','?')}")
    principles = {row.get("id"): row for row in data.get("principles", [])}
    for assessment in data.get("assessments", []):
        principle = principles.get(assessment.get("principle_id"), {})
        p(f"Giudizio tattico {assessment.get('plan_compliance')} · qualità tecnica {assessment.get('technical_quality')} · evento {assessment.get('event_id')} · principio {principle.get('title','?')} · pagina PDF {principle.get('pdf_page') or '—'} · {assessment.get('reason','')}")
    section("Palle inattive")
    set_pieces = [x for x in data.get("events", []) if x.get("event_type") == "set_piece"]
    if not set_pieces: p("Nessun piazzato annotato; i movimenti fuori campo non sono inferiti.")
    for event in set_pieces:
        p(f"Osservazione · video {event.get('video_start_ms')}–{event.get('video_end_ms')} ms · {event.get('description')} · ID {event.get('id')}")
    section("Giocatori")
    highlights = data.get("player_highlights", [])
    if not highlights: p("Nessun TOP/FLOP con clip e valutazione verificata.")
    for item in highlights:
        p(f"{item.get('name')}: TOP {len(item.get('top',[]))}; FLOP {len(item.get('flop',[]))}.")
        for label in ("top", "flop"):
            for episode in item.get(label, [])[:3]: p(f"{label.upper()} · {episode.get('description')} · evento {episode.get('event_id')} · video {episode.get('video_start_ms')} ms · clip {episode.get('clip_source_id')} · {episode.get('reason')}")
    section("Squadra e avversario")
    for scope,label,limit in (("strength","Forza",3),("weakness","Criticità",3),("opponent_vulnerability","Vulnerabilità avversaria",5)):
        rows = [x for x in data.get("findings", []) if x.get("scope") == scope and x.get("status") == "confermato"][:limit]
        if not rows: p(f"{label}: evidenza insufficiente.")
        for item in rows:
            refs = [e.get('event_id') for e in data.get('finding_evidence', []) if e.get('finding_id') == item.get('id') and e.get('stance') == 'supports']
            p(f"{label} · {item.get('title')} · {item.get('violations',0)}/{item.get('observed_opportunities',0)} opportunità · episodi {', '.join(refs) or 'nessuno'} · {item.get('context','')}")
    section("Impressioni e controevidenze")
    for item in data.get("impressions", []):
        p(f"Impressione originale: {item.get('impression_text')}")
        for review in item.get("impression_reviews", []): p(f"Revisione {review.get('revision')} · {review.get('verdict')} · {review.get('reasoning')}")
    if not data.get("impressions"): p("Nessuna impressione registrata.")
    section("Allenamenti e follow-up")
    for item in data.get("interventions", []): p(f"Proposta: {item.get('exercise')} · obiettivo {item.get('observable_objective')} · svolto {item.get('performed_at') or 'non registrato'}")
    for item in data.get("followups", []): p(f"Verifica partita {item.get('target_match_id') or 'da assegnare'} · {item.get('verdict') or 'in attesa'}")
    decision_story = [Paragraph("Decisioni approvate dallo staff", styles["ReportSection"])]
    approved_decisions = [x for x in data.get("decisions", []) if x.get("decision_briefings", {}).get("status") == "approved"]
    latest = max((x.get("decision_briefings", {}).get("created_at", "") for x in approved_decisions), default="")
    decisions = sorted((x for x in approved_decisions if x.get("decision_briefings", {}).get("created_at", "") == latest), key=lambda x: x.get("position", 0))[:3]
    if not decisions: decision_story.append(Paragraph("Nessuna decisione approvata con evidenze sufficienti.", styles["ReportBody"]))
    for item in decisions:
        line = f"{item.get('position')}. {item.get('decision_text')} · Pro: {item.get('supporting_evidence')} · Contro: {item.get('contrary_evidence') or 'non registrate'} · Confidenza: {item.get('confidence_reason')} · Verifica: {item.get('next_match_check')}"
        decision_story.append(Paragraph(escape(line),styles["ReportBody"]))
    story.append(KeepTogether(decision_story))
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=(21*cm,29.7*cm), rightMargin=1.6*cm, leftMargin=1.6*cm, topMargin=1.6*cm, bottomMargin=1.6*cm, title="Viceallenatore AI - rapporto tattico")
    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#c4d2c8"))
        canvas.line(1.6*cm,1.2*cm,19.4*cm,1.2*cm)
        canvas.setFont("Helvetica",8)
        canvas.setFillColor(colors.HexColor("#56675a"))
        canvas.drawString(1.6*cm,0.85*cm,"Villanovese Analytics · campione annotato e revisionato")
        canvas.drawRightString(19.4*cm,0.85*cm,f"Pagina {document.page}")
        canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return str(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Viceallenatore AI - local media tools")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "export"):
        p = sub.add_parser(name); p.add_argument("match_id")
        if name == "export": p.add_argument("output")
    p = sub.add_parser("import")
    p.add_argument("match_id"); p.add_argument("kind", choices=("video", "mhtml", "pdf"))
    p.add_argument("provider", choices=("veo", "youcoach", "staff", "other")); p.add_argument("path")
    for name in ("proxy", "clip"):
        p = sub.add_parser(name); p.add_argument("match_id"); p.add_argument("source_id")
        if name == "clip": p.add_argument("start_ms", type=int); p.add_argument("end_ms", type=int)
    p = sub.add_parser("relink"); p.add_argument("match_id"); p.add_argument("source_id"); p.add_argument("path")
    p = sub.add_parser("report"); p.add_argument("input_json"); p.add_argument("output_pdf")
    p = sub.add_parser("annotate"); p.add_argument("match_id"); p.add_argument("source_id")
    p.add_argument("start_ms", type=int); p.add_argument("end_ms", type=int); p.add_argument("description")
    p.add_argument("--period", choices=("first_half","second_half","extra_time","unknown"), default="unknown")
    p.add_argument("--minute", type=int)
    args = parser.parse_args(argv)
    try:
        if args.command == "init": result = {"database": str(match_dir(args.match_id) / "manifest.sqlite3")}; database(args.match_id).close()
        elif args.command == "import": result = add_source(args.match_id, args.provider, args.kind, args.path)
        elif args.command == "proxy": result = {"proxy": make_proxy(args.match_id, args.source_id)}
        elif args.command == "clip": result = {"clip": make_clip(args.match_id, args.source_id, args.start_ms, args.end_ms)}
        elif args.command == "relink": result = relink_source(args.match_id, args.source_id, args.path)
        elif args.command == "report": result = {"pdf": render_report(args.input_json, args.output_pdf)}
        elif args.command == "annotate": result = annotate(args.match_id,args.source_id,args.start_ms,args.end_ms,args.description,args.period,args.minute)
        else: result = export_bundle(args.match_id, args.output)
        if args.command == "import":
            result = {key: result[key] for key in ("id", "match_id", "provider", "kind", "filename", "sha256", "size_bytes", "imported_at")}
        elif args.command == "export":
            result = {"bundle": str(Path(args.output).resolve()), "match_id": args.match_id,
                      "source_count": len(result["sources"]), "event_count": len(result["events"])}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
