import json
import subprocess
import tempfile
import unittest
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from unittest.mock import patch

from local_engine import viceallenatore as va


class LocalEngineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.data_patch = patch.object(va, "DATA", self.folder / "data")
        self.data_patch.start()
        self.match = "MONTAGNANA/COPPA 06-09-2026"

    def tearDown(self):
        self.data_patch.stop()
        self.tmp.cleanup()

    def test_mhtml_is_data_only_and_import_is_idempotent(self):
        message = MIMEMultipart("related")
        message.attach(MIMEText("<script>gol 99′</script><p>Gol 13′</p>", "html", "utf-8"))
        report = self.folder / "report.mhtml"
        report.write_bytes(message.as_bytes())
        first = va.add_source(self.match, "youcoach", "mhtml", report)
        second = va.add_source(self.match, "youcoach", "mhtml", report)
        self.assertEqual(first["id"], second["id"])
        metadata = json.loads(first["metadata"])
        self.assertEqual(metadata["goal_candidates"][0]["minute"], 13)
        self.assertNotIn("99", json.dumps(metadata))
        veo_message = MIMEMultipart("related")
        veo_message.attach(MIMEText("<p>Goal 12′</p>", "html", "utf-8"))
        veo_report = self.folder / "veo.mhtml"
        veo_report.write_bytes(veo_message.as_bytes())
        veo = va.add_source(self.match, "veo", "mhtml", veo_report)
        self.assertEqual(json.loads(veo["metadata"])["goal_candidates"][0]["minute"], 12)
        bundle = self.folder / "bundle.json"
        exported = va.export_bundle(self.match, bundle)
        self.assertEqual(len(exported["sources"]),2)
        self.assertNotIn("local_path", bundle.read_text())
        self.assertNotIn(str(report), bundle.read_text())
        import pymupdf
        pdf = self.folder / "conflict.pdf"
        va.render_report(bundle, pdf)
        with pymupdf.open(pdf) as doc:
            report_text = "\n".join(page.get_text() for page in doc)
            self.assertIn("Veo 12", report_text)
            self.assertIn("YouCoach 13", report_text)
            self.assertIn("Conflitto ancora aperto", report_text)

    def test_match_id_never_becomes_path(self):
        self.assertEqual(va.match_dir("../../outside").parent, self.folder / "data")

    def test_relink_requires_identical_file(self):
        message = MIMEMultipart("related")
        message.attach(MIMEText("<p>Gol 13′</p>", "html", "utf-8"))
        original = self.folder / "original.mhtml"
        original.write_bytes(message.as_bytes())
        source = va.add_source(self.match, "youcoach", "mhtml", original)
        moved = self.folder / "moved.mhtml"
        moved.write_bytes(original.read_bytes())
        self.assertTrue(va.relink_source(self.match, source["id"], moved)["sha256_verified"])
        db = va.database(self.match)
        self.assertEqual(db.execute("select local_path from sources where id=?", (source["id"],)).fetchone()[0], str(moved.resolve()))
        db.close()
        moved.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "does not match"):
            va.relink_source(self.match, source["id"], moved)

    def test_real_report_goal_layouts_remain_unverified(self):
        veo = va.goal_candidates(["Squadra 3 - 1 Avversaria", "Jersey #7 (12')",
                                  "Jersey #10 (44')", "Casa", "3 - 1", "Trasferta",
                                  "Jersey #14 (64')", "Panoramica"])
        youcoach = va.goal_candidates(["13'", "Gol di Giocatore", "44'", "Gol di Altro giocatore"])
        self.assertEqual([goal["minute"] for goal in veo], [12, 44, 64])
        self.assertEqual([goal["minute"] for goal in youcoach], [13, 44])
        self.assertTrue(all(goal["status"] == "candidate_unverified" for goal in veo + youcoach))
        kpis = va.veo_kpi_candidates(["Numeri chiave di entrambe le squadre", "Gol", "3", "1",
                                      "Possesso", "50%", "50%", "Formazione iniziale"])
        timeline = va.youcoach_timeline_candidates(["9'", "Cartellino Giallo per Giocatore",
                                                     "13'", "Gol di Giocatore", "45'", "Sostituzione"])
        self.assertEqual([(k["metric"], k["first_value"], k["second_value"]) for k in kpis],
                         [("Gol", "3", "1"), ("Possesso", "50%", "50%")])
        self.assertEqual([e["event_type"] for e in timeline], ["card", "goal", "substitution"])

    def test_pdf_pages_and_report(self):
        from reportlab.pdfgen import canvas
        import pymupdf
        pdf = self.folder / "piano.pdf"
        c = canvas.Canvas(str(pdf)); c.drawString(50, 750, "Piano gara dimostrativo"); c.showPage(); c.save()
        source = va.add_source(self.match, "staff", "pdf", pdf)
        pages = json.loads(source["metadata"])["pages"]
        self.assertEqual(len(pages), 1)
        self.assertIn("Piano gara", pages[0]["text"])
        self.assertTrue((va.match_dir(self.match) / f"pdf-{source['sha256'][:12]}" / "page-001.png").is_file())
        report_json = self.folder / "report.json"
        report_json.write_text(json.dumps({"schema_version":"1.0.0","match_id":self.match,"match_name":"Test sintetico","sources":[],"events":[],"compliance":{"denominator":0}}))
        result = self.folder / "report.pdf"
        va.render_report(report_json, result)
        with pymupdf.open(result) as doc:
            self.assertIn("Viceallenatore AI", doc[0].get_text())
            self.assertIn("Nessuna fonte", doc[0].get_text())

    def test_video_proxy_clip_and_manifest(self):
        if not va.shutil.which("ffmpeg"):
            self.skipTest("FFmpeg unavailable")
        video = self.folder / "source.mp4"
        subprocess.run(["ffmpeg","-nostdin","-v","error","-f","lavfi","-i","color=c=green:s=640x360:r=10:d=2","-c:v","libx264","-y",str(video)],check=True)
        source = va.add_source(self.match,"veo","video",video)
        self.assertEqual(json.loads(source["metadata"])["width"], 640)
        proxy = Path(va.make_proxy(self.match, source["id"]))
        self.assertEqual(va.probe(proxy)["width"], 640)
        clip = Path(va.make_clip(self.match, source["id"], 500, 1500))
        self.assertTrue(clip.stat().st_size > 0)
        self.assertGreater(va.probe(clip)["duration_ms"], 500)
        event = va.annotate(self.match, source["id"], 500, 1500, "Osservazione sintetica", "first_half", 2)
        self.assertEqual(event["schema_version"], va.SCHEMA_VERSION)
        self.assertEqual(event["claims"][0]["type"], "osservazione")
        self.assertFalse(event["game_clock"]["mapping_verified"])
        bundle = self.folder / "bundle.json"
        data = va.export_bundle(self.match, bundle)
        self.assertTrue(any(s["kind"] == "clip" for s in data["sources"]))
        self.assertEqual(data["events"][0]["event_id"], event["event_id"])
        self.assertEqual(va.export_bundle(self.match, bundle)["events"][0]["event_id"], event["event_id"])

    def test_4k_proxy_is_at_most_1080p(self):
        if not va.shutil.which("ffmpeg"):
            self.skipTest("FFmpeg unavailable")
        video = self.folder / "4k.mp4"
        subprocess.run(["ffmpeg","-nostdin","-v","error","-f","lavfi","-i","color=c=black:s=3840x2160:r=2:d=1","-threads","2","-c:v","libx264","-y",str(video)],check=True)
        source = va.add_source(self.match,"veo","video",video)
        proxy = va.probe(Path(va.make_proxy(self.match,source["id"])))
        self.assertLessEqual(proxy["width"],1920)
        self.assertLessEqual(proxy["height"],1080)

    def test_report_has_evidence_and_at_most_three_decisions(self):
        import pymupdf
        report_json = self.folder / "review.json"
        decisions = [{"position": i, "decision_text": f"Decisione {i}", "supporting_evidence":"evento sintetico", "confidence_reason":"campione limitato", "next_match_check":"verificare", "decision_briefings":{"status":"approved","created_at":"2026-11-20"}} for i in range(1,5)]
        data = {"schema_version":"1.0.0","match_id":"TEST","match_name":"Partita sintetica", "sources":[{"provider":"veo","kind":"video","filename":"test.mp4","sha256":"a"*64}], "approved_plan_version":1, "approved_model_version":1, "compliance":{"denominator":2,"conforme":1,"non_conforme":1,"adattamenti":0,"non_valutabili":1}, "events":[{"id":f"E{i}","description":"Osservazione sintetica con limite di campo visivo.","video_start_ms":i*1000,"video_end_ms":i*1000+500,"source_id":"S1"} for i in range(20)], "decisions":decisions}
        report_json.write_text(json.dumps(data))
        pdf = self.folder / "review.pdf"
        va.render_report(report_json,pdf)
        with pymupdf.open(pdf) as doc:
            content = "\n".join(page.get_text() for page in doc)
            self.assertGreaterEqual(len(doc),2)
            self.assertIn("Decisione 3",content)
            self.assertNotIn("Decisione 4",content)
            self.assertIn("1/2",content)


if __name__ == "__main__":
    unittest.main()
