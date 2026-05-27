import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import List, Dict

logger = logging.getLogger(__name__)

# Only send alerts for these severity levels
ALERT_SEVERITIES = {"HIGH", "CRITICAL"}


class AlertService:
    """Email alert service for safety violations."""

    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")

    def _get_dynamic_recipients(self) -> List[str]:
        """Fetch email recipients from database or fall back to environment settings."""
        try:
            from database_models import SystemSetting
            setting = SystemSetting.query.filter_by(key="alert_emails").first()
            if setting and setting.value:
                emails = [e.strip() for e in setting.value.split(",") if e.strip()]
                if emails:
                    return emails
        except Exception as e:
            logger.warning(
                f"Could not load dynamic email recipients from database: {e}. "
                "Falling back to environment."
            )
        
        # Fallback to env variable
        return [
            r.strip()
            for r in os.getenv("ALERT_EMAIL_RECIPIENTS", "").split(",")
            if r.strip()
        ]

    def send_alerts(self, violations: List[Dict], cctv_id: str) -> None:
        """Send email alerts for violations that meet severity threshold."""
        import threading
        critical_violations = [
            v for v in violations
            if v.get("severity", "").upper() in ALERT_SEVERITIES
        ]

        if not critical_violations:
            return

        recipients = self._get_dynamic_recipients()

        if not self.smtp_user or not recipients:
            logger.warning(
                "Alert email not configured (SMTP_USER or recipients missing). "
                f"Skipping {len(critical_violations)} alert(s) for {cctv_id}."
            )
            return

        try:
            subject = f"[YAWard ALERT] {len(critical_violations)} Safety Violation(s) - {cctv_id}"
            body = self._build_email_body(critical_violations, cctv_id)
            
            # Start a background daemon thread to avoid blocking the main Flask/Gunicorn worker
            thread = threading.Thread(
                target=self._send_email_background,
                args=(subject, body, cctv_id, len(critical_violations), recipients)
            )
            thread.daemon = True
            thread.start()
            logger.info(f"Alert email background thread started for {cctv_id}.")
        except Exception as e:
            logger.error(f"Failed to start alert email thread: {e}")

    def _send_email_background(self, subject: str, body: str, cctv_id: str, count: int, recipients: List[str]) -> None:
        """Helper function executed in background to send email."""
        try:
            self._send_email(subject, body, recipients)
            logger.info(f"Alert email sent successfully for {cctv_id} in background thread: {count} violation(s).")
        except Exception as e:
            logger.error(f"Background thread failed to send alert email for {cctv_id}: {e}")

    def _build_email_body(self, violations: List[Dict], cctv_id: str) -> str:
        """Construct HTML email body."""
        rows = ""
        for v in violations:
            ts = v.get("timestamp")
            if hasattr(ts, "isoformat"):
                ts = ts.isoformat()
            rows += f"""
            <tr>
                <td style="padding:8px;border:1px solid #ddd;">{v.get('type','')}</td>
                <td style="padding:8px;border:1px solid #ddd;color:{'red' if v.get('severity')=='CRITICAL' else 'orange'};">
                    {v.get('severity','')}
                </td>
                <td style="padding:8px;border:1px solid #ddd;">{v.get('person_id','N/A')}</td>
                <td style="padding:8px;border:1px solid #ddd;">{v.get('message','')}</td>
                <td style="padding:8px;border:1px solid #ddd;">{ts}</td>
            </tr>"""

        return f"""
        <html><body>
        <h2 style="color:#c0392b;">⚠️ YAWard Safety Alert</h2>
        <p><strong>Camera:</strong> {cctv_id}<br>
        <strong>Time:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC<br>
        <strong>Violations Detected:</strong> {len(violations)}</p>
        <table style="border-collapse:collapse;width:100%;">
            <thead>
                <tr style="background:#f44336;color:white;">
                    <th style="padding:8px;">Type</th>
                    <th style="padding:8px;">Severity</th>
                    <th style="padding:8px;">Person ID</th>
                    <th style="padding:8px;">Message</th>
                    <th style="padding:8px;">Timestamp</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
        <p style="color:#666;margin-top:20px;font-size:12px;">
            This is an automated alert from YAWard AI Safety Monitoring System.
        </p>
        </body></html>
        """

    def _send_email(self, subject: str, body: str, recipients: List[str]) -> None:
        """Send email via SMTP."""
        if not recipients:
            logger.warning("No email recipients configured, skipping email delivery.")
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.smtp_user
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(body, "html"))

        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.smtp_user, recipients, msg.as_string())
